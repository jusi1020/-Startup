// api/subwayTimetable.js
export const config = {
    runtime: "nodejs",
    regions: ["icn1", "hnd1"]
  };
  
  export default async function handler(req, res) {
    // CORS (동일 도메인만 쓰면 생략 가능)
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
    );
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET")   return res.status(405).json({ error: "Method Not Allowed" });
  
    try {
      let { railOprIsttCd, lnCd, stinCd, dayCd = "8", format = "json" } = req.query;
  
      if (!railOprIsttCd || !lnCd || !stinCd) {
        return res.status(400).json({ error: "Missing params: railOprIsttCd, lnCd, stinCd are required." });
      }
      if (!["7","8","9"].includes(String(dayCd))) dayCd = "8";
      format = String(format).toLowerCase() === "xml" ? "xml" : "json";
  
      const rawKey = process.env.KRIC_KEY;
      if (!rawKey) {
        return res.status(500).json({
          error: "KRIC_KEY is not configured on the server.",
          hint: "Vercel → Project → Settings → Environment Variables에 KRIC_KEY를 설정하세요."
        });
      }
      const isPercentEncoded = /%[0-9A-Fa-f]{2}/.test(rawKey);
      const encodedKey = isPercentEncoded ? rawKey : encodeURIComponent(rawKey);
  
      const base = "https://openapi.kric.go.kr/openapi/trainUseInfo/subwayTimetable";
      const qs = new URLSearchParams({
        format: format.toUpperCase(),
        railOprIsttCd: String(railOprIsttCd),
        lnCd: String(lnCd),
        stinCd: String(stinCd),
        dayCd: String(dayCd)
      });
      const url = `${base}?${qs.toString()}&serviceKey=${encodedKey}`;
  
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
      const upstream = await fetch(url, { headers: { "User-Agent": "CampusGuide/1.0 (+vercel)" }, signal: ac.signal })
        .catch(e => { throw new Error(`Network error: ${e.message || e}`); });
      clearTimeout(timer);
  
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        return res.status(upstream.status).json({ error: `Upstream ${upstream.status}`, detail: text.slice(0,500) });
      }
  
      const ct = upstream.headers.get("content-type") || "";
      const cache = "s-maxage=60, stale-while-revalidate=300";
  
      if (ct.includes("xml")) {
        const xml = await upstream.text();
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", cache);
        return res.status(200).send(xml);
      } else {
        let body;
        try { body = await upstream.json(); }
        catch { const text = await upstream.text(); body = { raw: text }; }
        res.setHeader("Cache-Control", cache);
        return res.status(200).json(body);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      const isAbort = /aborted|AbortError/i.test(msg);
      return res.status(isAbort ? 504 : 500).json({ error: isAbort ? "Gateway Timeout" : "Server error", detail: msg });
    }
  }
  