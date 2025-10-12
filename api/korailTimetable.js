// api/korailTimetable.js
export const config = { runtime: "nodejs" };

const STATION_IDS = {
  // ❗사용할 API 규격에 맞는 역 ID로 교체하세요.
  // 예) TAGO(국가철도) TrainInfoService 계열이면 depPlaceId/arrPlaceId 값.
  // 예시(빈 값): 실제 ID를 넣어야 정상 응답됨.
  "밀양": "",
  "부산": "",
  "구포": "",
  "동대구": "",
  "대전": "",
  "서울": ""
};

// 사용하려는 API 엔드포인트에 맞춰 URL과 파라미터를 수정하세요.
function buildKorailURL(serviceKey, fromName, toName, ymd){
  // 예시: (data.go.kr) 1613000/TrainInfoService/getStrtpntAlocFndTrainInfo
  const base = "https://apis.data.go.kr/1613000/TrainInfoService/getStrtpntAlocFndTrainInfo";
  const depId = STATION_IDS[fromName], arrId = STATION_IDS[toName];
  const qs = new URLSearchParams({
    serviceKey: serviceKey, // 퍼센트 인코딩된 키여야 함
    depPlaceId: depId || "",  // 역 ID (필수)
    arrPlaceId: arrId || "",  // 역 ID (필수)
    depPlandTime: ymd,        // YYYYMMDD
    numOfRows: "200",
    pageNo: "1",
    _type: "json"
  });
  return `${base}?${qs.toString()}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")     return res.status(405).json({ error:"Method Not Allowed" });

  try{
    const { from, to, date } = req.query; // from/to: 한글 역명, date: YYYYMMDD
    if(!from || !to || !date) return res.status(400).json({ error:"Missing params: from, to, date" });

    const key = process.env.TAGO_KEY;
    if(!key) return res.status(500).json({ error:"TAGO_KEY is not configured on the server." });

    const encodedKey = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);

    // 역 ID가 비어있으면 안내
    if(!STATION_IDS[from] || !STATION_IDS[to]){
      return res.status(400).json({ error:"Station ID not configured", detail:`STATION_IDS['${from}'], STATION_IDS['${to}'] 를 채워주세요.` });
    }

    const url = buildKorailURL(encodedKey, from, to, String(date));

    const ac = new AbortController(); const timer = setTimeout(()=>ac.abort(), 12_000);
    const upstream = await fetch(url, { signal: ac.signal }).catch(e=>{ throw new Error(`Network error: ${e.message||e}`); });
    clearTimeout(timer);

    if(!upstream.ok){
      const text = await upstream.text().catch(()=> "");
      return res.status(upstream.status).json({ error:`Upstream ${upstream.status}`, detail:text.slice(0,500) });
    }
    const ct = upstream.headers.get("content-type") || "";
    const cache = "s-maxage=120, stale-while-revalidate=600";

    if(ct.includes("xml")){
      const xml = await upstream.text();
      res.setHeader("Content-Type","application/xml; charset=utf-8");
      res.setHeader("Cache-Control", cache);
      return res.status(200).send(xml);
    }else{
      const body = await upstream.json().catch(async()=>({ raw: await upstream.text() }));
      res.setHeader("Cache-Control", cache);
      return res.status(200).json(body);
    }
  }catch(err){
    const msg = String(err?.message||err);
    const isAbort=/aborted|AbortError/i.test(msg);
    return res.status(isAbort?504:500).json({ error:isAbort?"Gateway Timeout":"Server error", detail:msg });
  }
}
