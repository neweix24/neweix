"use client";

import { useEffect, useState } from "react";
import styles from "./homepage-youtube-videos.module.css";

type Video = { id: string; title: string; thumbnail: string; publishedAt: string | null };

export default function HomepageYouTubeVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/public/youtube-videos", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feed unavailable")))
      .then((data: { videos?: Video[] }) => { if (active && Array.isArray(data.videos)) setVideos(data.videos); })
      .catch(() => { if (active) setVideos([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setSelected(null); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  if (!videos.length) return null;

  return (
    <section className={styles.section} aria-labelledby="homepage-youtube-title">
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>WATCH NEWEIX</span><h2 id="homepage-youtube-title">আমাদের সর্বশেষ ভিডিও</h2><p>YouTube চ্যানেলের নতুন ভিডিওগুলো এখানে স্বয়ংক্রিয়ভাবে দেখুন।</p></div>
        <a href="https://www.youtube.com/" target="_blank" rel="noreferrer">YouTube চ্যানেল <span aria-hidden="true">↗</span></a>
      </div>
      <div className={styles.grid}>
        {videos.map((video) => (
          <button className={styles.card} type="button" key={video.id} onClick={() => setSelected(video.id)} aria-label={`ভিডিও চালান: ${video.title}`}>
            <span className={styles.thumbnail}><img src={video.thumbnail} alt="" loading="lazy" /><span className={styles.play} aria-hidden="true">▶</span></span>
            <span className={styles.title}>{video.title}</span>
          </button>
        ))}
      </div>
      {selected && <div className={styles.modal} role="dialog" aria-modal="true" aria-label="YouTube ভিডিও প্লেয়ার" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <div className={styles.player}><button type="button" className={styles.close} onClick={() => setSelected(null)} aria-label="ভিডিও বন্ধ করুন">×</button><iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected)}?autoplay=1&rel=0`} title="NEWEIX YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
      </div>}
    </section>
  );
}
