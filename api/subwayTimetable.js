// api/subwayTimetable.js
// Vercel Serverless Function (Node.js runtime)

export const config = {
    runtime: "nodejs",          // Edge로 돌리고 싶다면 "edge"로 바꾸되, env 정책 확인 필수
    regions: ["icn1", "hnd1"]   // (선택) 아시아 근접 리전 우선
  };
  
  export default async function handler(req, res) {
    // CORS (동일 도메인에서만 쓰면 생략 가능)
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
    );
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
  
    try {
      let { railOprIsttCd, lnCd, stinCd, dayCd = "8", format = "json" } = req.query;
  
      // --- 파라미터 검증 ---
      if (!railOprIsttCd || !lnCd || !stinCd) {
        return res
          .status(400)
          .json({ error: "Missing params: railOprIsttCd, lnCd, stinCd are required." });
      }
      // 허용 요일코드: 7(토), 8(평일), 9(휴일)
      if (!["7", "8", "9"].includes(String(dayCd))) dayCd = "8";
      format = String(format).toLowerCase() === "xml" ? "xml" : "json";
  
      // --- API Key (환경변수 필수) ---
      const rawKey = process.env.KRIC_KEY;
      if (!rawKey) {
        return res.status(500).json({
          error: "KRIC_KEY is not configured on the server.",
          hint: "Vercel → Project → Settings → Environment Variables에 KRIC_KEY를 설정하세요."
        });
      }
  
      // 서비스키 인코딩 판별: %xx 패턴이 있으면 '이미 인코딩됨'으로 간주
      const isPercentEncoded = /%[0-9A-Fa-f]{2}/.test(rawKey);
      const encodedKey = isPercentEncoded ? rawKey : encodeURIComponent(rawKey);
  
      // --- 요청 URL 구성 (serviceKey는 직접 querystring에 붙여 이중인코딩 방지) ---
      const base = "https://openapi.kric.go.kr/openapi/trainUseInfo/subwayTimetable";
      const params = new URLSearchParams({
        format: format.toUpperCase(),
        railOprIsttCd: String(railOprIsttCd),
        lnCd: String(lnCd),
        stinCd: String(stinCd),
        dayCd: String(dayCd)
      });
      let url = `${base}?${params.toString()}&serviceKey=${encodedKey}`;
  
      // --- 타임아웃 컨트롤러 (기본 10초) ---
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
  
      const upstream = await fetch(url, {
        // 일부 기관에서 user-agent 요구하는 경우가 있어 지정
        headers: { "User-Agent": "CampusGuide/1.0 (+vercel)" },
        signal: ac.signal
      }).catch((e) => {
        // fetch 단계에서의 네트워크 오류
        throw new Error(`Network error: ${e.message || e}`);
      });
      clearTimeout(timer);
  
      // 상태코드 체크
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        // 보안상 전체 URL 로그 금지 (서비스키 포함) → 마스킹
        return res.status(upstream.status).json({
          error: `Upstream ${upstream.status}`,
          detail: text.slice(0, 500)
        });
      }
  
      // 응답 콘텐츠 타입에 맞춰 그대로 패스스루
      const ct = upstream.headers.get("content-type") || "";
      const cacheHeader = "s-maxage=60, stale-while-revalidate=300"; // CDN 캐시
  
      if (ct.includes("xml")) {
        const xml = await upstream.text();
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", cacheHeader);
        return res.status(200).send(xml);
      } else {
        // 일부 기관이 잘못된 content-type을 줄 수 있어 방어적으로 처리
        let body;
        try {
          body = await upstream.json();
        } catch {
          // JSON 파싱 실패 시 텍스트로 읽어 반환
          const text = await upstream.text();
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", cacheHeader);
          return res.status(200).json({ raw: text });
        }
        res.setHeader("Cache-Control", cacheHeader);
        return res.status(200).json(body);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      const isAbort = /aborted|AbortError/i.test(msg);
      return res.status(isAbort ? 504 : 500).json({
        error: isAbort ? "Gateway Timeout" : "Server error",
        detail: msg
      });
    }
  }
  