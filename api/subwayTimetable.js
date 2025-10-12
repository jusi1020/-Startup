// api/subwayTimetable.js
export default async function handler(req, res) {
    try {
      const { railOprIsttCd, lnCd, stinCd, dayCd = "8", format = "json" } = req.query;
  
      if (!railOprIsttCd || !lnCd || !stinCd) {
        return res.status(400).json({ error: "Missing params: railOprIsttCd, lnCd, stinCd are required." });
      }
      
      // Vercel 환경변수에서 API 키 가져오기
      const key = process.env.KRIC_KEY;
      if (!key) {
        return res.status(500).json({ error: "KRIC_KEY is not configured on the server." });
      }
  
      const u = new URL("https://openapi.kric.go.kr/openapi/trainUseInfo/subwayTimetable");
      u.searchParams.set("serviceKey", key);
      u.searchParams.set("format", format.toUpperCase());
      u.searchParams.set("railOprIsttCd", railOprIsttCd);
      u.searchParams.set("lnCd", lnCd);
      u.searchParams.set("stinCd", stinCd);
      u.searchParams.set("dayCd", dayCd);
  
      const r = await fetch(u.toString());
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
      return res.status(500).json({ error: "Upstream error", detail: String(err?.message || err) });
    }
  }