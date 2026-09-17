/** Fixed publisher endpoint, never fetch a user-controlled landing-page host. */
export function publisherAbstractUrl(doi:string|null) {
  const key=(doi||'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').trim().toLowerCase();
  return /^10\.1007\/[a-z0-9._;()-]+$/.test(key) ? `https://link.springer.com/article/${encodeURIComponent(key).replace('%2F','/')}` : null;
}
function decode(value:string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[e]!))
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';});
}
export function parsePublisherAbstract(html:string,doi:string) {
  const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>{
    const attrs=Object.fromEntries([...m[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(a=>[a[1].toLowerCase(),decode(a[2])]));
    return attrs;
  });
  const identity=meta.find(m=>/^(citation_doi|dc.identifier)$/i.test(m.name||''))?.content||'';
  const key=(s:string)=>s.replace(/^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i,'').trim().toLowerCase();
  if(key(identity)!==key(doi))return '';
  // Only the explicit abstract section, never page descriptions or full text.
  const section=html.match(/<section\b[^>]*\b(?:data-title=["']Abstract["']|aria-labelledby=["']Abs1["'])[^>]*>([\s\S]*?)<\/section>/i)?.[1]
    || html.match(/<div\b[^>]*id=["']Abs1-content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
  return decode(section.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,12000);
}
