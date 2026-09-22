param([string]$OutputFolder=$PSScriptRoot,[string]$ConfigFile=(Join-Path $PSScriptRoot 'config.json'),[string]$CacheDir='')
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$season=2026
$script:log=New-Object 'System.Collections.Generic.List[object]'
$script:raw=New-Object 'System.Collections.Generic.List[object]'
$script:teams=@{}; $script:usedAliases=@{}; $script:aliasMap=@{}; $script:nonD1=@{}
$utf8=New-Object Text.UTF8Encoding($false)
$script:downloadCache=''
function Progress([string]$message) {
 try {[IO.File]::WriteAllText((Join-Path $OutputFolder 'progress.txt'),$message,$utf8)}
 catch {
  $cause=$_.Exception;while($cause.InnerException){$cause=$cause.InnerException}
  # Progress is advisory. Excel can briefly hold the file while reading it.
  if(($cause.HResult -band 65535) -notin @(32,33)){throw}
 }
}
function Prefetch($config) {
 $script:downloadCache=Join-Path ([IO.Path]::GetFullPath($OutputFolder)) 'downloads'
 [void][IO.Directory]::CreateDirectory($script:downloadCache)
 $jobs=New-Object 'System.Collections.Generic.List[object]'
 foreach($c in $config.conferences){if($c.id -eq 'sec'){continue}
  $jobs.Add([pscustomobject]@{id=($c.id+'-standings.html');url=$c.urls.standings})
  $id=if($c.id -in @('bigten','socon')){$c.id+'-schedule.html'}else{$c.id+'-stats.html'}
  $jobs.Add([pscustomobject]@{id=$id;url=$c.urls.stats})
 }
 foreach($s in $config.supplements){$jobs.Add([pscustomobject]@{id=($s.id+'.html');url=$s.url})}
 $pool=[RunspaceFactory]::CreateRunspacePool(1,6);$pool.Open();$running=New-Object 'System.Collections.Generic.List[object]'
 $code={param($url,$file)
  $ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45
  if([int]$r.StatusCode -ne 200){throw "HTTP $($r.StatusCode): $url"}
  $body=$r.Content;if($body -is [byte[]]){$body=[Text.Encoding]::UTF8.GetString($body)}
  [IO.File]::WriteAllText($file,$body,(New-Object Text.UTF8Encoding($false)))
 }
 try {
  foreach($j in $jobs){$ps=[PowerShell]::Create();$ps.RunspacePool=$pool;[void]$ps.AddScript($code).AddArgument($j.url).AddArgument((Join-Path $script:downloadCache $j.id));$running.Add([pscustomobject]@{ps=$ps;handle=$ps.BeginInvoke();finished=$false;url=$j.url})}
  $completed=0
  while($completed -lt $running.Count){
   foreach($r in $running){if(!$r.finished -and $r.handle.IsCompleted){[void]$r.ps.EndInvoke($r.handle);if($r.ps.HadErrors){throw "Source download failed: $($r.url). $($r.ps.Streams.Error[0])"};$r.finished=$true;$completed++}}
   Progress "Downloaded $completed of $($running.Count) conference pages..."
   if($completed -lt $running.Count){Start-Sleep -Milliseconds 150}
  }
 } finally {foreach($r in $running){$r.ps.Dispose()};$pool.Close();$pool.Dispose()}
}
function TextOf([string]$s) { ([Net.WebUtility]::HtmlDecode([regex]::Replace($s,'(?s)<[^>]*>',' ')) -replace '\s+',' ').Trim() }
function Norm([string]$s) {
 $s=$s.Normalize([Text.NormalizationForm]::FormD).ToLowerInvariant()
 [regex]::Replace($s,'[^a-z0-9]','')
}
function Fetch([string]$id,[string]$url,[string]$conference,[string]$kind) {
 $preloaded=if($script:downloadCache){Join-Path $script:downloadCache $id}else{''}
 if($CacheDir -or ($preloaded -and [IO.File]::Exists($preloaded))){$file=if($CacheDir){Join-Path $CacheDir $id}else{$preloaded};$body=[IO.File]::ReadAllText($file);$stamp=[IO.File]::GetLastWriteTimeUtc($file).ToString('yyyy-MM-dd HH:mm:ss')}
 else {
  $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45
  if([int]$r.StatusCode -ne 200){throw "$conference $kind returned HTTP $($r.StatusCode)."}
  $body=$r.Content;if($body -is [byte[]]){$body=[Text.Encoding]::UTF8.GetString($body)}
  $stamp=[DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss')
  [IO.File]::WriteAllText((Join-Path $OutputFolder $id),$body,$utf8)
 }
 $script:log.Add([pscustomobject]@{conference=$conference;kind=$kind;url=$url;fetched=$stamp;status='Downloaded'})
 Progress "Reading $conference $kind..."
 return [string]$body
}
function Resolve([string]$s,[string]$context='') {
 $n=Norm $s
 if($n -eq 'miami') {if($context -eq 'acc'){return 'Miami (FL)'};if($context -eq 'mac'){return 'Miami (OH)'};return ''}
 if($n -eq 'loyola'){return ''}
 if($script:aliasMap.ContainsKey($n)){return [string]$script:aliasMap[$n]}
 return ''
}
function UsedAlias([string]$rawName,[string]$canonical,[string]$context) {
 $key=(Norm $rawName)+'|'+$canonical
 if(!$script:usedAliases.ContainsKey($key)) {$script:usedAliases[$key]=[pscustomobject]@{raw=$rawName;canonical=$canonical;contexts=(New-Object 'System.Collections.Generic.HashSet[string]')}}
 [void]$script:usedAliases[$key].contexts.Add($context)
}
function AddTeam($name,$conf,$w,$l,$url,$cw,$cl) {
 $c=Resolve $name $conf.id
 if(!$c){throw "School name needs review: $name ($($conf.name))."}
 if($script:teams.ContainsKey($c)){throw "Duplicate school in conference standings: $c."}
 if([string]$cw -notmatch '^\d+$' -or [string]$cl -notmatch '^\d+$'){throw "$($conf.name): missing or invalid conference record for $name."}
 $script:teams[$c]=[pscustomobject]@{canonical=$c;name=$name;conference=$conf.name;confid=$conf.id;w=[int]$w;l=[int]$l;cw=[int]$cw;cl=[int]$cl;url=$url}
 UsedAlias $name $c $conf.name
}
function Tables([string]$body) { @([regex]::Matches($body,'(?is)<table\b[^>]*>.*?</table>') | ForEach-Object {$_.Value}) }
function Cells([string]$row) { @([regex]::Matches($row,'(?is)<t[hd]\b([^>]*)>(.*?)</t[hd]>') | Where-Object {$_.Groups[1].Value -notmatch 'aria-hidden\s*=\s*["'']true'} | ForEach-Object {TextOf $_.Groups[2].Value}) }
function AddGame($date,$a,$b,$sa,$sb,$confid,$url,$rawA='',$rawB='',$note='',$kind='',$basis='') {
 if($date -notmatch '^2026-\d\d-\d\d$'){throw "Unexpected match season/date: $date"}
 if([int]$sa -eq [int]$sb -or [Math]::Max([int]$sa,[int]$sb) -ne 3 -or [Math]::Min([int]$sa,[int]$sb) -lt 0 -or [Math]::Min([int]$sa,[int]$sb) -gt 2){throw "Invalid final match score: $a $sa-$sb $b"}
 $script:raw.Add([pscustomobject]@{date=$date;a=$a;b=$b;sa=[int]$sa;sb=[int]$sb;confid=$confid;url=$url;rawA=$rawA;rawB=$rawB;note=$note;kind=$kind;basis=$basis})
}
function NextData([string]$body) {
 $m=[regex]::Match($body,'(?is)<script\b[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>')
 if(!$m.Success){throw 'Conference data format changed: missing season data.'}
 return ($m.Groups[1].Value | ConvertFrom-Json)
}
function LocalDate($g) {
 $tz=[string]$g.datetime.timezone
 $zone=switch -Regex ($tz) {
  'Los_Angeles|Vancouver' {'Pacific Standard Time';break}
  'Phoenix' {'US Mountain Standard Time';break}
  'Denver|Boise' {'Mountain Standard Time';break}
  'Honolulu' {'Hawaiian Standard Time';break}
  'New_York|Kentucky|Detroit|Indiana|Toronto|Nassau' {'Eastern Standard Time';break}
  'Chicago|Winnipeg' {'Central Standard Time';break}
  default {throw "Unrecognized match time zone: $tz"}
 }
 $utc=[DateTimeOffset]::Parse($g.datetime.date_scheduled).UtcDateTime
 [TimeZoneInfo]::ConvertTimeFromUtc($utc,[TimeZoneInfo]::FindSystemTimeZoneById($zone)).ToString('yyyy-MM-dd')
}
function SheetXml($writer,[string]$name,$rows) {
 $ns='urn:schemas-microsoft-com:office:spreadsheet'
 $writer.WriteStartElement('Worksheet',$ns);$writer.WriteAttributeString('ss','Name',$ns,$name);$writer.WriteStartElement('Table',$ns)
 foreach($row in $rows){$writer.WriteStartElement('Row',$ns);foreach($v in $row){$writer.WriteStartElement('Cell',$ns);$writer.WriteStartElement('Data',$ns);$type='String';if($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]){$type='Number'};$writer.WriteAttributeString('ss','Type',$ns,$type);$writer.WriteString([string]$v);$writer.WriteEndElement();$writer.WriteEndElement()};$writer.WriteEndElement()}
 $writer.WriteEndElement();$writer.WriteEndElement()
}
try {
 [void][IO.Directory]::CreateDirectory($OutputFolder)
 foreach($file in @('done.txt','error.txt')) { $old=Join-Path $OutputFolder $file;if([IO.File]::Exists($old)){[IO.File]::Delete($old)} }
 $config=[IO.File]::ReadAllText($ConfigFile) | ConvertFrom-Json
 if($config.season -ne $season -or $config.conferences.Count -ne 32){throw 'Invalid 2026 source configuration.'}
 foreach($p in $config.aliases.PSObject.Properties){$script:aliasMap[$p.Name]=$p.Value.canonical}
 foreach($p in $config.nonD1.PSObject.Properties){$script:nonD1[$p.Name]=$p.Value}
 if(!$CacheDir){Prefetch $config}
 foreach($conf in $config.conferences) {
  $k=$conf.id
  if($k -eq 'sec') {
   $seasons=(Fetch 'sec-schedules.json' 'https://www.secsports.com/api/schedules?per_page=100&filter%5Bsport_id%5D=14&include%5B%5D=season' $conf.name 'Season registry') | ConvertFrom-Json
   $selected=@($seasons.data | Where-Object {$_.season.name -eq '2026'})
   if($selected.Count -ne 1){throw 'SEC 2026 season could not be identified.'}
   $id=$selected[0].id;$sid=$selected[0].season_id
   $events=New-Object 'System.Collections.Generic.List[object]';$page=1
   do {
    $file=if($page -eq 1){'sec-events.json'}else{"sec-events-$page.json"}
    $url="https://www.secsports.com/api/schedule-events?per_page=200&page=$page&filter%5Bschedule.sport_id%5D=14&filter%5Bschedule.season_id%5D=$sid&include%5B%5D=firstOpponent.school&include%5B%5D=secondOpponent.school"
    $response=(Fetch $file $url $conf.name 'Match results')|ConvertFrom-Json
    foreach($g in $response.data){$events.Add($g)}
    $last=[int]$response.meta.last_page;$page++
    if($page -gt 20){throw 'Unexpected SEC pagination.'}
   } while($page -le $last)
   $names=@{}
   foreach($g in $events){foreach($side in @('first','second')){$op=$g.($side+'_opponent');if($op.school_id){$names[[string]$op.school_id]=$op.name}}}
   $std=(Fetch 'sec-standings-api.json' "https://www.secsports.com/api/schedules/$id/standings?include%5B%5D=school" $conf.name 'Standings')|ConvertFrom-Json
   foreach($t in $std.data){AddTeam $names[[string]$t.school_id] $conf $t.overall_wins $t.overall_loses $conf.urls.standings $t.conference_wins $t.conference_loses}
   foreach($g in $events){if($g.status -ne 'completed' -or $g.is_exhibition){continue}
    $a=$g.first_opponent.name;if(!$a){$a=$g.first_opponent_name};$b=$g.second_opponent.name;if(!$b){$b=$g.second_opponent_name}
    $date=[TimeZoneInfo]::ConvertTimeFromUtc([DateTimeOffset]::Parse($g.datetime).UtcDateTime,[TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')).ToString('yyyy-MM-dd')
    $kind=if($g.is_conference){'Conference'}else{'Nonconference'}
    AddGame $date (Resolve $a $k) (Resolve $b $k) ([int][double]$g.first_opponent_score) ([int][double]$g.second_opponent_score) $k ('https://www.secsports.com/api/schedule-events/'+$g.id) $a $b '' $kind 'SEC match flag'
   }
  } elseif($k -in @('bigten','socon')) {
   $d=NextData (Fetch "$k-standings.html" $conf.urls.standings $conf.name 'Standings')
   if([int]$d.props.pageProps.params.season -ne 2026){throw "$($conf.name) standings show another season."}
   $found=$false
   foreach($p in $d.props.pageProps.fallback.PSObject.Properties){if($p.Name -notlike '*/standings/table*'){continue};$found=$true
    foreach($t in $p.Value.data){$record=@($t.data|Where-Object {$_.ovr_record})[0].ovr_record -split '-';$conferenceRecord=@($t.data|Where-Object {$_.conf_record})[0].conf_record -split '-';if($conferenceRecord.Count -ne 2){throw "$($conf.name): missing conference record for $($t.market)."};AddTeam $t.market $conf $record[0] $record[1] $conf.urls.standings $conferenceRecord[0] $conferenceRecord[1]}
   }
   if(!$found){throw "$($conf.name) standings are missing."}
   $d=NextData (Fetch "$k-schedule.html" $conf.urls.stats $conf.name 'Match results')
   if([int]$d.props.pageProps.params.season -ne 2026){throw "$($conf.name) schedule shows another season."}
   foreach($p in $d.props.pageProps.fallback.PSObject.Properties){if($p.Name -notlike '*contentTypeUid:"schedule"*'){continue}
    foreach($g in $p.Value){if($g.results.status -ne 'COMPLETE' -or $g.results.away_team_is_exhibition -or $g.results.home_team_is_exhibition){continue}
     $a=$g.teams.away_team[0].market;$b=$g.teams.home_team[0].market
     AddGame (LocalDate $g) (Resolve $a $k) (Resolve $b $k) $g.results.away_points $g.results.home_points $k $conf.urls.stats $a $b
    }
   }
  } else {
   $body=Fetch "$k-standings.html" $conf.urls.standings $conf.name 'Standings'
   $table=@(Tables $body | Where-Object {$_ -match 'sidearm-standings-table'})
   if($table.Count -ne 1 -or $table[0] -notmatch '(?is)<caption[^>]*>\s*2026'){throw "$($conf.name) 2026 standings table is missing."}
   $thead=[regex]::Match($table[0],'(?is)<thead.*?</thead>').Value
   $headers=Cells $thead;$index=[Array]::IndexOf($headers,'Overall');if($index -lt 0){$index=[Array]::IndexOf($headers,'OVERALL')};if($index -lt 0){$index=[Array]::IndexOf($headers,'W-L')};if($index -lt 0){throw "$($conf.name) overall record column is missing."}
   $conferenceIndexes=@(for($ci=0;$ci -lt $headers.Count;$ci++){if($headers[$ci] -match '^(Conf\.?|Conference|Conf\. W-L|ACC|Big South|BW|PL|SLC)$'){$ci}})
   if($conferenceIndexes.Count -ne 1){throw "$($conf.name) conference record column is missing or ambiguous."}
   $conferenceIndex=$conferenceIndexes[0]
   $tbody=[regex]::Match($table[0],'(?is)<tbody.*?</tbody>').Value
   foreach($tr in [regex]::Matches($tbody,'(?is)<tr\b[^>]*>.*?</tr>')) {
    $cs=Cells $tr.Value;if($cs.Count -ne $headers.Count){continue}
    $rec=$cs[$index] -split '-';if($rec.Count -ne 2){throw "$($conf.name) has an invalid standing."}
    $conferenceRecord=$cs[$conferenceIndex] -split '-';if($conferenceRecord.Count -ne 2){throw "$($conf.name) has an invalid conference standing for $($cs[0])."}
    AddTeam $cs[0] $conf $rec[0] $rec[1] $conf.urls.standings $conferenceRecord[0] $conferenceRecord[1]
   }
   $body=Fetch "$k-stats.html" $conf.urls.stats $conf.name 'Match results'
   $table=@(Tables $body | Where-Object {$_ -match '(?is)<caption[^>]*>\s*Overall Results\s*</caption>'})
   if($table.Count -ne 1){throw "$($conf.name) match results table is missing."}
   foreach($tr in [regex]::Matches($table[0],'(?is)<tr\b[^>]*>.*?</tr>')) {
    $cs=Cells $tr.Value;if($cs.Count -ne 3 -or $cs[0] -eq 'Date'){continue}
    $r=[regex]::Match($cs[2],'^(.*?)\s+(\d+)\s*-\s*(\d+)\s+(.*?)$');if(!$r.Success){throw "$($conf.name): unrecognized result $($cs[2])"}
    $a=$r.Groups[1].Value;$b=$r.Groups[4].Value
    $date=[DateTime]::ParseExact($cs[0],'MM/dd/yyyy',[Globalization.CultureInfo]::InvariantCulture).ToString('yyyy-MM-dd')
    $kind=if($a.Trim().StartsWith('*')){'Conference'}else{'Nonconference'}
    AddGame $date (Resolve $a $k) (Resolve $b $k) $r.Groups[2].Value $r.Groups[3].Value $k $conf.urls.stats $a $b '' $kind 'Conference results marker (* = conference)'
   }
  }
 }
 if($script:teams.Count -lt 330 -or $script:teams.Count -gt 370){throw "Unexpected D1 team count: $($script:teams.Count)."}
 # Resolve ambiguous opponent abbreviations by corroborating date, opponent and score from a second conference.
 foreach($g in $script:raw) {
  foreach($side in @('a','b')) {
   if($g.$side){continue};$rawName=if($side -eq 'a'){$g.rawA}else{$g.rawB};$prefix=Norm $rawName
   if($prefix -notin @('miami','loyola')){throw "Unmatched school name needs review: $rawName."}
   $other=if($side -eq 'a'){'b'}else{'a'};$ownScore=if($side -eq 'a'){$g.sa}else{$g.sb};$otherScore=if($side -eq 'a'){$g.sb}else{$g.sa};$candidates=@{}
   foreach($h in $script:raw){if($h.date -ne $g.date -or $h.confid -eq $g.confid){continue}
    if($h.a -eq $g.$other -and $h.sa -eq $otherScore -and $h.sb -eq $ownScore -and (Norm $h.b).StartsWith($prefix)){$candidates[$h.b]=$true}
    if($h.b -eq $g.$other -and $h.sb -eq $otherScore -and $h.sa -eq $ownScore -and (Norm $h.a).StartsWith($prefix)){$candidates[$h.a]=$true}
   }
   if($candidates.Count -ne 1){throw "Unmatched or ambiguous school: $($g.rawA) vs $($g.rawB), $($g.date). Candidates: $($candidates.Keys -join ', '). Saved data will be retained."}
   $g.$side=@($candidates.Keys)[0]
  }
 }
 foreach($g in $script:raw) {
  foreach($fix in $config.corrections){if($g.date -ne $fix.date -or $g.confid -ne $fix.confid){continue}
   if($g.a -eq $fix.team -and $g.b -eq $fix.wrong){$g.b=$fix.right;$g.note=$fix.note;$g.url=$g.url+' | '+$fix.url}
   if($g.b -eq $fix.team -and $g.a -eq $fix.wrong){$g.a=$fix.right;$g.note=$fix.note;$g.url=$g.url+' | '+$fix.url}
  }
 }
 # Supplement results omitted from conference statistics, using the conference's team schedule.
 foreach($s in $config.supplements) {
  $body=Fetch ($s.id+'.html') $s.url $s.team 'Supplemental schedule'
  if((TextOf ([regex]::Match($body,'(?is)<title.*?</title>').Value)) -notmatch '2026'){throw "$($s.team) schedule season changed."}
  $table=@(Tables $body|Where-Object {$_ -match 'sidearm-schedule-table'})
  if($table.Count -ne 1){throw "$($s.team) supplemental schedule is missing."}
  $rows=@([regex]::Matches($table[0],'(?is)<tr\b[^>]*>.*?</tr>'));$heads=Cells $rows[0].Value
  $opIndex=[Array]::IndexOf($heads,'Opponent');$resultIndex=[Array]::IndexOf($heads,'Time/Result');if($resultIndex -lt 0){$resultIndex=[Array]::IndexOf($heads,'Result')}
  if($opIndex -lt 0 -or $resultIndex -lt 0){throw 'Supplemental schedule columns changed.'}
  foreach($tr in $rows|Select-Object -Skip 1){$cs=Cells $tr.Value;if($cs.Count -ne $heads.Count){continue}
   $score=[regex]::Match($cs[$resultIndex],'\b([WL])\s*,?\s*(\d)\s*-\s*(\d)');if(!$score.Success){continue}
   $rawOpponent=($cs[$opIndex] -replace '^(?:vs\.?|at)\s+','').Trim();$opp=Resolve $rawOpponent $s.confid;if(!$opp){throw "New opponent needs classification: $rawOpponent ($($s.team))."}
   $dateText=$cs[0] -replace '(\d+/\d+)-\d+(/\d+)','$1$2';$date=[DateTime]::ParseExact($dateText,'M/d/yyyy',[Globalization.CultureInfo]::InvariantCulture).ToString('yyyy-MM-dd')
   $exists=@($script:raw |Where-Object {(($_.a -eq $s.team -and $_.b -eq $opp) -or ($_.b -eq $s.team -and $_.a -eq $opp)) -and [Math]::Abs(([DateTime]$_.date-[DateTime]$date).TotalDays) -le 1})
   if($exists.Count -gt 0){continue}
   AddGame $date $s.team $opp $score.Groups[2].Value $score.Groups[3].Value $s.confid $s.url $s.team $rawOpponent 'Result supplemented from the conference team schedule.'
  }
 }
 $merged=@{};$pairDates=@{}
 foreach($g in $script:raw) {
  foreach($t in @($g.a,$g.b)){if(!$script:teams.ContainsKey($t) -and !$script:nonD1.ContainsKey($t)){throw "Opponent division is unresolved: $t."}}
  UsedAlias $g.rawA $g.a $g.confid;UsedAlias $g.rawB $g.b $g.confid
  if([string]::CompareOrdinal($g.a,$g.b) -gt 0){$a=$g.b;$b=$g.a;$sa=$g.sb;$sb=$g.sa}else{$a=$g.a;$b=$g.b;$sa=$g.sa;$sb=$g.sb}
  $pair=$g.date+'|'+$a+'|'+$b;$key=$pair+'|'+$sa+'|'+$sb
  if($pairDates.ContainsKey($pair) -and $pairDates[$pair] -ne $key){throw "Conflicting scores or doubleheader needs review: $pair. Saved data retained."}
  $pairDates[$pair]=$key
  if(!$merged.ContainsKey($key)){$merged[$key]=[pscustomobject]@{id=$key;date=$g.date;a=$a;b=$b;sa=$sa;sb=$sb;count=0;urls=(New-Object 'System.Collections.Generic.HashSet[string]');rawNames=(New-Object 'System.Collections.Generic.HashSet[string]');notes=(New-Object 'System.Collections.Generic.HashSet[string]');kinds=(New-Object 'System.Collections.Generic.HashSet[string]');bases=(New-Object 'System.Collections.Generic.HashSet[string]');kind='';basis=''}}
  $m=$merged[$key];$m.count++;[void]$m.urls.Add($g.url);[void]$m.rawNames.Add($g.rawA+' / '+$g.rawB);if($g.note){[void]$m.notes.Add($g.note)}
  if($g.kind){[void]$m.kinds.Add($g.kind);[void]$m.bases.Add($g.basis)}
 }
 if($merged.Count -lt 1000){throw 'Too few matches returned. Saved data retained.'}
 $games=@($merged.Values|Sort-Object date,a,b);$teamList=@($script:teams.Values|Sort-Object canonical)
 foreach($g in $games){
  $same=$script:teams.ContainsKey($g.a) -and $script:teams.ContainsKey($g.b) -and $script:teams[$g.a].confid -eq $script:teams[$g.b].confid
  if($g.kinds.Count -gt 1){throw "Conference-match classification conflicts: $($g.id)."}
  if($g.kinds.Count -eq 1){$g.kind=@($g.kinds)[0];$g.basis=[string]::Join(' | ',[string[]]$g.bases)}
  elseif($same){$g.kind='Conference';$g.basis='Inferred from 2026 conference membership; source has no match flag'}
  else{$g.kind='Nonconference';$g.basis='Different conference membership or non-D1 opponent'}
  if($g.kind -eq 'Conference' -and !$same){throw "Conference flag disagrees with membership: $($g.id)."}
  foreach($fix in $config.matchTypes){if($g.date -eq $fix.date -and $g.a -eq $fix.a -and $g.b -eq $fix.b){$g.kind=$fix.kind;$g.basis=$fix.note;[void]$g.urls.Add($fix.url);[void]$g.notes.Add($fix.note)}}
 }
 $records=@{};foreach($t in $teamList){$records[$t.canonical]=@(0,0,0,0)}
 foreach($g in $games){$isD1=$script:teams.ContainsKey($g.a) -and $script:teams.ContainsKey($g.b)
  foreach($side in @('a','b')){$t=$g.$side;if(!$records.ContainsKey($t)){continue};$win=if($side -eq 'a'){$g.sa -gt $g.sb}else{$g.sb -gt $g.sa};$ix=if($win){0}else{1};$records[$t][$ix]++;if($isD1){$records[$t][$ix+2]++}}
 }
 $mismatches=@($teamList|Where-Object {$records[$_.canonical][0] -ne $_.w -or $records[$_.canonical][1] -ne $_.l})
 $utc=[DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss');$through=($games|Select-Object -Last 1).date
 $standRows=New-Object 'System.Collections.Generic.List[object]';$standRows.Add(@('School','2026 conference','Source school name','Standings wins','Standings losses','Standings source','Pulled UTC','Conference wins','Conference losses'))
 foreach($t in $teamList){$standRows.Add(@($t.canonical,$t.conference,$t.name,$t.w,$t.l,$t.url,$utc,$t.cw,$t.cl))}
 $gameRows=New-Object 'System.Collections.Generic.List[object]';$gameRows.Add(@('Match ID','Date','School 1','School 2','Sets 1','Sets 2','Division 1','Division 2','Reports merged','Sources','Raw school names','Data note','Match type','Match type basis'))
 foreach($g in $games){$d1=if($script:teams.ContainsKey($g.a)){'D1'}else{$script:nonD1[$g.a]};$d2=if($script:teams.ContainsKey($g.b)){'D1'}else{$script:nonD1[$g.b]};$gameRows.Add(@($g.id,([DateTime]::ParseExact($g.date,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture).ToOADate()),$g.a,$g.b,$g.sa,$g.sb,$d1,$d2,$g.count,([string]::Join(' | ',[string[]]$g.urls)),([string]::Join(' | ',[string[]]$g.rawNames)),([string]::Join(' | ',[string[]]$g.notes)),$g.kind,$g.basis))}
 $nameRows=New-Object 'System.Collections.Generic.List[object]';$nameRows.Add(@('Source name','Standard school name','Division','Seen in','Matching note'))
 foreach($a in @($script:usedAliases.Values|Sort-Object canonical,raw)){$div=if($script:teams.ContainsKey($a.canonical)){'D1'}else{$script:nonD1[$a.canonical]};$note=if($a.raw -eq $a.canonical){'Exact name'}elseif($a.raw -in @('Miami','Loyola')){'Conference or corroborating match resolves ambiguity'}else{'Reviewed alias'};$nameRows.Add(@($a.raw,$a.canonical,$div,([string]::Join(', ',[string[]]$a.contexts)),$note))}
 $sourceRows=New-Object 'System.Collections.Generic.List[object]';$sourceRows.Add(@('Conference or school','Data type','Source URL','Fetched UTC','Status'))
 foreach($s in $script:log){$sourceRows.Add(@($s.conference,$s.kind,$s.url,$s.fetched,$s.status))}
 $metaRows=New-Object 'System.Collections.Generic.List[object]';$metaRows.Add(@('Metric','Value'));$metaRows.Add(@('Season',2026));$metaRows.Add(@('D1 schools',$teamList.Count));$metaRows.Add(@('Unique matches',$games.Count));$metaRows.Add(@('Duplicate reports removed',($script:raw.Count-$games.Count)));$metaRows.Add(@('Through games',$through));$metaRows.Add(@('Fetched UTC',$utc));$metaRows.Add(@('Standings discrepancies',$mismatches.Count));$metaRows.Add(@('Conferences',32));$metaRows.Add(@('Non-D1 matches',@($games|Where-Object {!$script:teams.ContainsKey($_.a) -or !$script:teams.ContainsKey($_.b)}).Count))
 $settings=New-Object Xml.XmlWriterSettings;$settings.Encoding=$utf8;$settings.Indent=$false
 $writer=[Xml.XmlWriter]::Create((Join-Path $OutputFolder 'data.xml'),$settings)
 try {$writer.WriteStartDocument();$writer.WriteStartElement('Workbook','urn:schemas-microsoft-com:office:spreadsheet');$writer.WriteAttributeString('xmlns','ss',$null,'urn:schemas-microsoft-com:office:spreadsheet');SheetXml $writer 'Standings' $standRows;SheetXml $writer 'Matches' $gameRows;SheetXml $writer 'School names' $nameRows;SheetXml $writer 'Source log' $sourceRows;SheetXml $writer 'Meta' $metaRows;$writer.WriteEndElement();$writer.WriteEndDocument()}finally{$writer.Close()}
 $result=[pscustomobject]@{teams=$teamList;games=@($games|ForEach-Object {[pscustomobject]@{id=$_.id;date=$_.date;a=$_.a;b=$_.b;sa=$_.sa;sb=$_.sb;count=$_.count;urls=@($_.urls);notes=@($_.notes);kind=$_.kind;basis=$_.basis}});records=$records;meta=$metaRows.ToArray();standings=$standRows.ToArray();matches=$gameRows.ToArray();aliases=$nameRows.ToArray();sources=$sourceRows.ToArray()}
 [IO.File]::WriteAllText((Join-Path $OutputFolder 'data.json'),($result|ConvertTo-Json -Depth 12),$utf8)
 [IO.File]::WriteAllText((Join-Path $OutputFolder 'done.txt'),'OK',$utf8)
 Write-Output ("Completed: {0} schools, {1} matches, {2} duplicate reports removed, {3} standings discrepancies." -f $teamList.Count,$games.Count,($script:raw.Count-$games.Count),$mismatches.Count)
} catch {
 [IO.File]::WriteAllText((Join-Path $OutputFolder 'error.txt'),($_.Exception.Message+' ['+$_.InvocationInfo.ScriptLineNumber+']'),$utf8)
 Write-Error $_
 exit 1
}
