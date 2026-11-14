import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export default function NotFound(){return <div className="not-found"><span className="eyebrow">404 — PAGE NOT FOUND</span><h1>এই পৃষ্ঠাটি পাওয়া যায়নি</h1><p>ঠিকানাটি পরীক্ষা করুন অথবা Neweix Homepage-এ ফিরে যান।</p><Link href="/" className="button-primary">হোমে ফিরুন <ArrowUpRight size={15}/></Link></div>;}
