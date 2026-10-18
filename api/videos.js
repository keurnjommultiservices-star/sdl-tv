// Fonction Vercel : lit la chaîne YouTube de SDL et renvoie la liste des vidéos en JSON.
// Sans clé : flux RSS officiel (15 dernières vidéos).
// Avec la variable d'environnement YOUTUBE_API_KEY : jusqu'à 100 vidéos via l'API YouTube.
const CHANNEL_ID = "UCNjxTyTmhlY3fKT2Uuu2Ztw";

const decode = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

async function fromRss() {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  if (!r.ok) throw new Error("rss " + r.status);
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    if (!id) continue;
    out.push({
      id,
      title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1]),
      date: ((e.match(/<published>([^<]+)<\/published>/) || [])[1] || "").slice(0, 10),
      desc: decode((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1]).slice(0, 300),
    });
  }
  return out;
}

async function fromApi(key) {
  const playlist = "UU" + CHANNEL_ID.slice(2);
  const out = [];
  let token = "";
  for (let i = 0; i < 2; i++) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlist}&key=${key}` +
      (token ? `&pageToken=${token}` : "");
    const r = await fetch(url);
    if (!r.ok) throw new Error("api " + r.status);
    const j = await r.json();
    for (const it of j.items || []) {
      const s = it.snippet || {};
      const id = s.resourceId && s.resourceId.videoId;
      if (!id || s.title === "Private video" || s.title === "Deleted video") continue;
      out.push({ id, title: s.title, date: (s.publishedAt || "").slice(0, 10), desc: (s.description || "").slice(0, 300) });
    }
    token = j.nextPageToken || "";
    if (!token) break;
  }
  return out;
}

module.exports = async (req, res) => {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    let videos;
    try {
      videos = key ? await fromApi(key) : await fromRss();
    } catch (e) {
      videos = await fromRss();
    }
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ videos });
  } catch (e) {
    res.status(502).json({ error: "Impossible de lire la chaîne YouTube", videos: [] });
  }
};

