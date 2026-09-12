import "../src/lib/load-env";
import { createClient } from "@supabase/supabase-js";
async function main() {
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: rooms } = await db.from("rooms").select("id,code,name,current_version_id,created_at").order("created_at", { ascending: false }).limit(10);
console.log("rooms:", rooms?.length ?? 0);
for (const r of rooms ?? []) console.log(` ${r.code}  current=${r.current_version_id?.slice(0,8) ?? "none"}  ${r.created_at}`);
const { data: vs } = await db.from("versions").select("id,room_id,status,progress,instruction,glb_url,error,author_name,created_at").order("created_at", { ascending: false }).limit(15);
console.log("\nversions:", vs?.length ?? 0);
for (const v of vs ?? []) console.log(` ${v.id.slice(0,8)} ${v.status.padEnd(10)} ${String(v.progress).padStart(3)}%  "${v.instruction}" by ${v.author_name}  glb=${v.glb_url ? "yes" : "no"} ${v.error ? "ERR:"+v.error.slice(0,80) : ""}`);

}
main();
