// api/subwayTimetable.js
export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    try {
      const { railOprIsttCd, lnCd, stinCd, dayCd = "8", format = "json" } = req.query;
  
      if (!railOprIsttCd || !lnCd || !stinCd) {
        return res.status(400).json({ error: "Missing params: railOprIsttCd, lnCd, stinCd are required." });
      }
      
      // Vercel 환경변수에서 API 키 가져오기 (디코딩 필요)
      const key = process.env.KRIC_KEY || "$2a$10$SW0yovztlTbcv13V7n6lJ.6Jzh1KieFxjPHnbo9ijlIYw6kyJKzEO";
      
      const u = new URL("https://openapi.kric.go.kr/openapi/trainUseInfo/subwayTimetable");
      u.searchParams.set("serviceKey", decodeURIComponent(key));
      u.searchParams.set("format", format.toUpperCase());
      u.searchParams.set("railOprIsttCd", railOprIsttCd);
      u.searchParams.set("lnCd", lnCd);
      u.searchParams.set("stinCd", stinCd);
      u.searchParams.set("dayCd", dayCd);
  
      console.log("API Request URL:", u.toString()); // 디버깅용
      
      const r = await fetch(u.toString());
      
      if (!r.ok) {
        console.error("API Response Status:", r.status);
        const text = await r.text();
        console.error("API Response:", text);
        return res.status(r.status).json({ error: `API returned ${r.status}`, detail: text });
      }
      
      const ct = r.headers.get("content-type") || "";
      
      // 캐시 설정 (1분 캐시, 5분 동안 stale-while-revalidate)
      const cacheHeader = "s-maxage=60, stale-while-revalidate=300";
  
      if (ct.includes("xml")) {
        const xml = await r.text();
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", cacheHeader);
        return res.status(200).send(xml);
      } else {
        const json = await r.json();
        res.setHeader("Cache-Control", cacheHeader);
        return res.status(200).json(json);
      }
    } catch (err) {
      console.error("Handler error:", err);
      return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
    }
  }