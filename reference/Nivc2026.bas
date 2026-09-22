#If VBA7 Then
Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal milliseconds As Long)
#Else
Private Declare Sub Sleep Lib "kernel32" (ByVal milliseconds As Long)
#End If

Public Sub Refresh2026(Optional ByVal ShowMessages As Boolean = True)
    Dim fso As Object, shell As Object, folder As String, command As String, started As Date, progress As String
    Dim message As String, oldCancel As XlEnableCancelKey
    On Error GoTo Failed
    If ThisWorkbook.ReadOnly Then Err.Raise vbObjectError + 200, , "Save an editable .xlsm copy before refreshing."
    If Len(ThisWorkbook.path) = 0 Then Err.Raise vbObjectError + 201, , "Save the workbook before refreshing."
    oldCancel = Application.EnableCancelKey
    Application.EnableCancelKey = xlErrorHandler
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set shell = CreateObject("WScript.Shell")
    folder = fso.BuildPath(fso.GetSpecialFolder(2), "NIVC-" & fso.GetTempName)
    fso.CreateFolder folder
    WriteEmbeddedFile "B", folder & "\refresh.ps1"
    WriteEmbeddedFile "C", folder & "\config.json"
    ThisWorkbook.Worksheets("Tracking").Range("A6").Value2 = "Downloading 2026 conference sources. Please keep Excel open..."
    command = Quote(shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe") & _
        " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " & Quote(folder & "\refresh.ps1") & " -OutputFolder " & Quote(folder)
    shell.Run command, 0, False
    started = Now
    Do
        DoEvents
        If fso.FileExists(folder & "\error.txt") Then Err.Raise vbObjectError + 202, , ReadUtf8(folder & "\error.txt")
        If fso.FileExists(folder & "\done.txt") Then Exit Do
        If fso.FileExists(folder & "\progress.txt") Then
            progress = ReadUtf8(folder & "\progress.txt")
            ThisWorkbook.Worksheets("Tracking").Range("A6").Value2 = progress
            Application.StatusBar = "NIVC: " & progress
        End If
        If DateDiff("s", started, Now) > 600 Then Err.Raise vbObjectError + 203, , "The refresh timed out. Check your connection or your organization's PowerShell policy."
        Sleep 250
    Loop
    message = Apply2026Data(folder & "\data.xml", ShowMessages)
    Application.StatusBar = False
    Application.EnableCancelKey = oldCancel
    Exit Sub
Failed:
    message = "Refresh failed: " & Err.Description & " Saved rankings and outreach notes were retained."
    On Error Resume Next
    ThisWorkbook.Worksheets("Tracking").Range("A6").Value2 = message
    Application.StatusBar = False
    Application.EnableCancelKey = oldCancel
    If ShowMessages Then MsgBox message, vbExclamation, "NIVC refresh"
End Sub

Public Function Apply2026Data(ByVal XmlPath As String, Optional ByVal ShowMessages As Boolean = True) As String
    Dim stage As Workbook, tracking As Worksheet, engine As Worksheet, source As Worksheet
    Dim nTeams As Long, nGames As Long, nTrack As Long, previousTeams As Long, previousGames As Long
    Dim beforeNotes As Object, afterNotes As Object, snapshot As Object, sizes As Object, oldRanges As Object
    Dim key As Variant, c As Long, r As Long, name As String, n As Long, added As Long, item As Variant
    Dim oldEvents As Boolean, oldScreen As Boolean, oldAlerts As Boolean, oldCalc As XlCalculation
    Dim states As Boolean, editing As Boolean, backup As String, message As String, errorText As String
    Dim row As ListRow, v As Variant, target As Worksheet, endRow As Long
    On Error GoTo Failed
    If ThisWorkbook.ReadOnly Then Err.Raise vbObjectError + 204, , "This workbook is read-only."
    Set tracking = ThisWorkbook.Worksheets("Tracking")
    Set engine = ThisWorkbook.Worksheets("Engine")
    ValidateLayout
    Set beforeNotes = ManualInputs(tracking)
    previousTeams = ThisWorkbook.Worksheets("Standings").ListObjects(1).ListRows.Count
    previousGames = ThisWorkbook.Worksheets("Matches").ListObjects(1).ListRows.Count
    Set stage = Application.Workbooks.Open(XmlPath, 0, True)
    nTeams = CLng(stage.Worksheets("Meta").Cells(3, 2).Value2)
    nGames = CLng(stage.Worksheets("Meta").Cells(4, 2).Value2)
    If CLng(stage.Worksheets("Meta").Cells(2, 2).Value2) <> 2026 Then Err.Raise vbObjectError + 205, , "Source season is not 2026."
    If CLng(stage.Worksheets("Meta").Cells(9, 2).Value2) <> 32 Then Err.Raise vbObjectError + 206, , "Not all 32 conferences were read."
    If nTeams < 330 Or nTeams > 370 Or Abs(nTeams - previousTeams) > 10 Then Err.Raise vbObjectError + 207, , "The D1 school count changed unexpectedly."
    If nGames < previousGames * 0.95 Or nGames > 10000 Then Err.Raise vbObjectError + 208, , "The match feed appears incomplete or too large."
    If stage.Worksheets("Standings").UsedRange.Rows.Count <> nTeams + 1 Or stage.Worksheets("Matches").UsedRange.Rows.Count <> nGames + 1 Then Err.Raise vbObjectError + 209, , "Source row counts do not reconcile."
    If CDate(stage.Worksheets("Meta").Cells(6, 2).Value2) < CDate(tracking.Range("B3").Value2) Then Err.Raise vbObjectError + 210, , "The source is older than the saved data."
    If ThisWorkbook.Worksheets("RPI calculation").Range("T3").Value2 + ThisWorkbook.Worksheets("RPI calculation").Range("T4").Value2 + ThisWorkbook.Worksheets("RPI calculation").Range("T5").Value2 <> 1 Then Err.Raise vbObjectError + 211, , "RPI weights must sum to 100%."
    For Each item In Array("Standings", "Matches", "School names", "Source log")
        Set source = stage.Worksheets(CStr(item))
        Set target = ThisWorkbook.Worksheets(CStr(item))
        For c = 1 To source.UsedRange.Columns.Count
            If source.Cells(1, c).Value2 <> target.Cells(8, c).Value2 Then Err.Raise vbObjectError + 212, , CStr(item) & " source columns changed."
        Next c
    Next item
    Set snapshot = CreateObject("Scripting.Dictionary")
    Set sizes = CreateObject("Scripting.Dictionary")
    Set oldRanges = CreateObject("Scripting.Dictionary")
    For Each item In Array("Tracking", "RPI calculation", "Standings", "Matches", "School names", "Source log")
        Set target = ThisWorkbook.Worksheets(CStr(item))
        snapshot.Add CStr(item), target.UsedRange.Formula
        sizes.Add CStr(item), target.UsedRange.Address
        oldRanges.Add CStr(item), target.ListObjects(1).Range.Address
    Next item
    backup = BackupPath()
    ThisWorkbook.SaveCopyAs backup
    oldEvents = Application.EnableEvents: oldScreen = Application.ScreenUpdating
    oldAlerts = Application.DisplayAlerts: oldCalc = Application.Calculation
    states = True
    Application.EnableEvents = False: Application.ScreenUpdating = False
    Application.DisplayAlerts = False: Application.Calculation = xlCalculationManual
    editing = True
    For Each item In Array("Standings", "Matches", "School names", "Source log")
        Set source = stage.Worksheets(CStr(item))
        Set target = ThisWorkbook.Worksheets(CStr(item))
        n = source.UsedRange.Rows.Count - 1
        target.ListObjects(1).DataBodyRange.ClearContents
        target.ListObjects(1).Resize target.Cells(8, 1).Resize(n + 1, target.ListObjects(1).ListColumns.Count)
        If CStr(item) = "Matches" Then target.Range("B9:B" & n + 8).NumberFormat = "mm/dd/yy"
        target.Cells(9, 1).Resize(n, source.UsedRange.Columns.Count).Value2 = source.Cells(2, 1).Resize(n, source.UsedRange.Columns.Count).Value2
    Next item
    Set target = ThisWorkbook.Worksheets("RPI calculation")
    target.ListObjects(1).DataBodyRange.ClearContents
    target.ListObjects(1).Resize target.Range("A8:AF" & nTeams + 8)
    target.Range("A9:A" & nTeams + 8).Value2 = ThisWorkbook.Worksheets("Standings").Range("A9:A" & nTeams + 8).Value2
    For r = 9 To nTeams + 8
        name = CStr(target.Cells(r, 1).Value2)
        If Not beforeNotes.Exists(name) Then
            Set row = tracking.ListObjects(1).ListRows.Add
            tracking.Range("A" & row.Range.row - 1 & ":Y" & row.Range.row - 1).Copy Destination:=row.Range
            row.Range.ClearContents
            row.Range.Cells(1, 1).Value2 = name
            row.Range.Cells(1, 11).Value2 = "No": row.Range.Cells(1, 12).Value2 = "Unknown"
            row.Range.Cells(1, 13).Value2 = "Not started": row.Range.Cells(1, 19).Value2 = "Unknown"
            added = added + 1
        End If
    Next r
    Application.CutCopyMode = False
    nTrack = tracking.ListObjects(1).ListRows.Count
    RebuildFormulas nTeams, nGames, nTrack
    tracking.Range("B3").Value2 = CDbl(CDate(stage.Worksheets("Meta").Cells(6, 2).Value2))
    tracking.Range("B3").NumberFormat = "mm/dd/yyyy"
    ThisWorkbook.Worksheets("Matches").Range("A3").Value2 = nGames & " unique matches; " & stage.Worksheets("Meta").Cells(5, 2).Value2 & " duplicate reports merged. Non-D1 games are excluded from base RPI and retained for penalties."
    ThisWorkbook.Worksheets("Source log").Range("A6").Value2 = "Last successful refresh (UTC): " & stage.Worksheets("Meta").Cells(7, 2).Value2
    Application.CalculateFullRebuild
    CheckFormulaErrors
    Set afterNotes = ManualInputs(tracking)
    For Each key In beforeNotes.Keys
        If Not afterNotes.Exists(key) Then Err.Raise vbObjectError + 213, , "A school with outreach history disappeared."
        For c = 1 To 10
            If CStr(beforeNotes(key)(1, c)) <> CStr(afterNotes(key)(1, c)) Then Err.Raise vbObjectError + 214, , "Outreach note preservation failed for " & CStr(key) & "."
        Next c
    Next key
    If Application.WorksheetFunction.Count(ThisWorkbook.Worksheets("RPI calculation").Range("N9:N" & nTeams + 8)) <> nTeams Then Err.Raise vbObjectError + 215, , "An estimated ranking could not be calculated."
    If Application.WorksheetFunction.Count(ThisWorkbook.Worksheets("RPI calculation").Range("AE9:AE" & nTeams + 8)) <> nTeams Then Err.Raise vbObjectError + 215, , "An adjusted ranking could not be calculated."
    message = "Updated " & nTeams & " schools through " & Format$(tracking.Range("B3").Value2, "mmm d, yyyy") & ". Base and adjusted estimates recalculated. " & stage.Worksheets("Meta").Cells(8, 2).Value2 & " standings differences. Notes preserved; backup saved."
    tracking.Range("A6").Value2 = message
    stage.Close False: Set stage = Nothing
    Application.Calculation = oldCalc
    ThisWorkbook.Save
    editing = False
    RestoreState states, oldEvents, oldScreen, oldAlerts, oldCalc
    Apply2026Data = message
    If ShowMessages Then MsgBox message, vbInformation, "NIVC 2026 refresh"
    Exit Function
Failed:
    errorText = Err.Description
    On Error Resume Next
    If editing Then RestoreSnapshot snapshot, sizes, oldRanges
    If Not stage Is Nothing Then stage.Close False
    RestoreState states, oldEvents, oldScreen, oldAlerts, oldCalc
    message = "Refresh failed: " & errorText & " No data update was saved."
    If Len(backup) > 0 Then message = message & " Original data is also saved in the backup."
    tracking.Range("A6").Value2 = message
    Apply2026Data = message
    If ShowMessages Then MsgBox message, vbExclamation, "NIVC 2026 refresh"
End Function

Private Sub RestoreSnapshot(ByVal snapshot As Object, ByVal sizes As Object, ByVal oldRanges As Object)
    Dim key As Variant, target As Worksheet
    For Each key In snapshot.Keys
        Set target = ThisWorkbook.Worksheets(CStr(key))
        target.ListObjects(1).DataBodyRange.ClearContents
        target.ListObjects(1).Resize target.Range(CStr(oldRanges(key)))
        target.Range(CStr(sizes(key))).Formula = snapshot(key)
    Next key
    Application.CalculateFullRebuild
End Sub

Private Sub RebuildFormulas(ByVal teams As Long, ByVal games As Long, ByVal trackingRows As Long)
    Dim e As Worksheet, s As Worksheet, r As Long, i As Long, n As Long, col As String, pattern As String, values() As Variant
    Set e = ThisWorkbook.Worksheets("Engine")
    r = 2
    Do While Len(CStr(e.Cells(r, 6).Value2)) > 0
        Set s = ThisWorkbook.Worksheets(CStr(e.Cells(r, 6).Value2))
        col = CStr(e.Cells(r, 7).Value2)
        pattern = "=" & CStr(e.Cells(r, 8).Value2)
        pattern = Replace$(Replace$(pattern, "{te}", CStr(teams + 8)), "{me}", CStr(games + 8))
        If s.name = "Matches" Then
            n = games
        ElseIf s.name = "RPI calculation" Then
            n = teams
        Else
            n = trackingRows
        End If
        ReDim values(1 To n, 1 To 1)
        For i = 1 To n: values(i, 1) = Replace$(pattern, "{r}", CStr(i + 8)): Next i
        s.Range(col & "9:" & col & n + 8).Formula = values
        r = r + 1
    Loop
End Sub

Private Function ManualInputs(ByVal s As Worksheet) As Object
    Dim d As Object, r As Long, name As String
    Set d = CreateObject("Scripting.Dictionary"): d.CompareMode = vbTextCompare
    For r = 9 To s.ListObjects(1).ListRows.Count + 8
        name = CStr(s.Cells(r, 1).Value2)
        If Len(name) = 0 Or d.Exists(name) Then Err.Raise vbObjectError + 216, , "Tracking has a blank or duplicate school name."
        d.Add name, s.Range("K" & r & ":T" & r).Value2
    Next r
    Set ManualInputs = d
End Function

Private Sub CheckFormulaErrors()
    Dim item As Variant, bad As Range
    For Each item In Array("Tracking", "RPI calculation", "Matches")
        Set bad = Nothing
        On Error Resume Next
        Set bad = ThisWorkbook.Worksheets(CStr(item)).UsedRange.SpecialCells(xlCellTypeFormulas, xlErrors)
        On Error GoTo 0
        If Not bad Is Nothing Then Err.Raise vbObjectError + 217, , "Calculation error on " & CStr(item) & " at " & bad.Cells(1, 1).Address & "."
    Next item
End Sub

Private Sub ValidateLayout()
    Dim s As Worksheet, item As Variant
    For Each item In Array("Tracking", "RPI calculation", "Standings", "Matches", "School names", "Source log")
        Set s = ThisWorkbook.Worksheets(CStr(item))
        If s.ListObjects.Count <> 1 Or s.ListObjects(1).Range.row <> 8 Then Err.Raise vbObjectError + 218, , "The workbook table layout changed."
    Next item
    Set s = ThisWorkbook.Worksheets("Tracking")
    If s.Cells(8, 1).Value2 <> "School" Or s.Cells(8, 11).Value2 <> "Watchlist" Or s.Cells(8, 20).Value2 <> "Notes" Or s.ListObjects(1).ListColumns.Count <> 25 Then Err.Raise vbObjectError + 219, , "Tracking columns changed. Restore the original layout."
    Set s = ThisWorkbook.Worksheets("RPI rules")
    s.Range("B25").Calculate
    If s.Range("B25").Value2 <> "Ready" Then Err.Raise vbObjectError + 220, , "Check the adjustment assumptions on RPI rules."
End Sub

Private Function BackupPath() As String
    Dim f As Object, folder As String, path As String, i As Long
    Set f = CreateObject("Scripting.FileSystemObject")
    If InStr(1, ThisWorkbook.path, "://", vbTextCompare) > 0 Then
        folder = CreateObject("WScript.Shell").SpecialFolders("MyDocuments") & "\NIVC RPI Backups"
    Else
        folder = ThisWorkbook.path & "\backups"
    End If
    If Not f.FolderExists(folder) Then f.CreateFolder folder
    path = folder & "\NIVC-before-2026-refresh-" & Format$(Now, "yyyymmdd-hhnnss") & ".xlsm"
    Do While f.FileExists(path): i = i + 1: path = folder & "\NIVC-before-2026-refresh-" & Format$(Now, "yyyymmdd-hhnnss") & "-" & i & ".xlsm": Loop
    BackupPath = path
End Function

Private Sub WriteEmbeddedFile(ByVal col As String, ByVal path As String)
    Dim e As Worksheet, data As String, r As Long, node As Object, stream As Object
    Set e = ThisWorkbook.Worksheets("Engine")
    For r = 2 To CLng(e.Range(col & "1").Value2) + 1: data = data & CStr(e.Range(col & r).Value2): Next r
    Set node = CreateObject("MSXML2.DOMDocument.6.0").createElement("base64")
    node.DataType = "bin.base64": node.Text = data
    Set stream = CreateObject("ADODB.Stream"): stream.Type = 1: stream.Open
    stream.Write node.nodeTypedValue: stream.SaveToFile path, 2: stream.Close
End Sub

Private Function ReadUtf8(ByVal path As String) As String
    Dim s As Object, attempt As Long, problem As String, succeeded As Boolean
    'The background download may briefly hold the progress file while replacing it.
    For attempt = 1 To 10
        On Error Resume Next
        Err.Clear
        Set s = CreateObject("ADODB.Stream"): s.Type = 2: s.Charset = "utf-8": s.Open
        s.LoadFromFile path
        If Err.Number = 0 Then
            ReadUtf8 = s.ReadText
            succeeded = (Err.Number = 0)
        End If
        problem = Err.Description
        s.Close: Set s = Nothing
        On Error GoTo 0
        If succeeded Then Exit Function
        Sleep 100
        DoEvents
    Next attempt
    Err.Raise vbObjectError + 221, , "Could not read refresh status: " & problem
End Function
Private Function Quote(ByVal value As String) As String
    Quote = Chr$(34) & value & Chr$(34)
End Function
Private Sub RestoreState(ByVal captured As Boolean, ByVal events As Boolean, ByVal screen As Boolean, ByVal alerts As Boolean, ByVal calc As XlCalculation)
    If Not captured Then Exit Sub
    Application.EnableEvents = events: Application.ScreenUpdating = screen
    Application.DisplayAlerts = alerts: Application.Calculation = calc
End Sub




-------------------------------------------------------------------------------
