import { PageHeader } from "@/components/page-header";
import { getMethod } from "@/lib/data/server";

export const dynamic = "force-dynamic";

function linkedText(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((part, index) => part.startsWith("http") ? <a className="source-link" href={part.replace(/[.,)]$/, "")} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a> : part);
}

export default async function MethodPage() {
  const method = await getMethod();
  return <><PageHeader title="Method" description="Workbook methodology, limitations and reviewed data findings." /><section className="method-grid">{method.map((item) => <article className="card" key={item.topic}><h2>{item.topic}</h2><p>{linkedText(item.details)}</p></article>)}</section></>;
}
