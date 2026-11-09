import { NextRequest, NextResponse } from "next/server";
import { pages } from "@/lib/site-data";
export async function GET(request: NextRequest) {
 const query=(request.nextUrl.searchParams.get("q")||"").trim().toLocaleLowerCase();
 if(query.length<2) return NextResponse.json({query,results:[]});
 if(query.length>100) return NextResponse.json({error:"Query is too long."},{status:400});
 const results=pages.map((item)=>{const title=item.title.toLocaleLowerCase();const description=item.description.toLocaleLowerCase();const words=item.keywords.map((word)=>word.toLocaleLowerCase());let score=0;if(title===query)score+=10;if(title.includes(query))score+=6;if(words.some((word)=>word===query))score+=8;if(words.some((word)=>word.includes(query)))score+=5;if(description.includes(query))score+=2;return {item,score};}).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(({item})=>({title:item.title,description:item.description,href:item.href,category:item.category}));
 return NextResponse.json({query,count:results.length,results},{headers:{"Cache-Control":"public, s-maxage=30, stale-while-revalidate=60"}});
}
