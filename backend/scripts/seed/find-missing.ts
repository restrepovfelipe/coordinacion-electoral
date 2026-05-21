import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  const f = path.resolve('/Users/feliperestrepo/Desktop/PÁGINAS WEB/coordinacion-electoral/backend/.env.local');
  for (const line of fs.readFileSync(f,'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq===-1) continue;
    const k=t.slice(0,eq).trim(), v=t.slice(eq+1).trim();
    if (!process.env[k]) process.env[k]=v;
  }
}

const prisma = new PrismaClient();

async function readCsv(filePath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath,{encoding:'utf-8'}), crlfDelay:Infinity });
  const rows: Record<string,string>[] = []; let headers: string[]=[]; let first=true;
  for await (const line of rl) {
    if (first){headers=line.split(',').map(h=>h.trim());first=false;continue;}
    if (!line.trim()) continue;
    const vals=line.split(',');
    const obj: Record<string,string>={};
    headers.forEach((h,i)=>{obj[h]=(vals[i]||'').trim();});
    rows.push(obj);
  }
  return rows;
}

function norm(s: string) { return (s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' '); }
function fullName(r: Record<string,string>) {
  return [r.primer_nombre,r.segundo_nombre,r.primer_apellido,r.segundo_apellido].map(s=>s.trim()).filter(Boolean).join(' ');
}
function normPhone(raw: string) { let p=(raw||'').replace(/\D/g,''); if(p.startsWith('57')&&p.length>10)p=p.slice(2); return p; }

const TARGETS = ['BARBOSA','BELLO','EL BAGRE','GIRARDOTA','GUATAPE','ITAGUI','JARDIN','MEDELLIN','RETIRO','SAN PEDRO','TURBO','VALPARAISO'];
const ALIASES: Record<string,string> = { 'BAGRE':'EL BAGRE','GUATAPÉ':'GUATAPE','ITAGÜÍ':'ITAGUI','JARDÍN':'JARDIN','MEDELLÍN':'MEDELLIN','RETIRO':'RETIRO','VALPARAÍSO':'VALPARAISO','SAN PEDRO DE LOS MILAGROS':'SAN PEDRO' };

async function main() {
  const rows = await readCsv(path.resolve('/Users/feliperestrepo/Desktop/PÁGINAS WEB/coordinacion-electoral/data/testigos_clean.csv'));

  for (const muniName of TARGETS) {
    const csvRows = rows.filter(r => {
      const mn = norm(r.municipio);
      if (norm(muniName)===mn) return true;
      for (const [alias,canonical] of Object.entries(ALIASES)) {
        if (canonical===muniName && norm(alias)===mn) return true;
      }
      return false;
    });
    if (!csvRows.length) continue;

    const muni = await prisma.municipio.findFirst({ where: { name: { equals: muniName, mode:'insensitive' } } });
    if (!muni) continue;

    const dbTestigos = await prisma.testigo.findMany({
      where: { puesto: { municipioId: muni.id } },
      select: { name:true, phone:true }
    });

    const dbByName = new Map<string,number>();
    dbTestigos.forEach(t => { const k=norm(t.name||''); dbByName.set(k,(dbByName.get(k)||0)+1); });

    const csvByName = new Map<string,number>();
    csvRows.forEach(r => { const k=norm(fullName(r)); csvByName.set(k,(csvByName.get(k)||0)+1); });

    const missing: string[] = [];
    for (const [name, csvCount] of csvByName) {
      const dbCount = dbByName.get(name)||0;
      if (csvCount > dbCount) {
        const diff = csvCount-dbCount;
        const row = csvRows.find(r=>norm(fullName(r))===name)!;
        missing.push(`  ${fullName(row)} | puesto: ${row.puesto_normalized} | phone: ${row.telefono_std} (csv:${csvCount} db:${dbCount})`);
      }
    }
    if (missing.length) {
      console.log(`\n=== ${muniName}: ${missing.length} faltantes ===`);
      missing.forEach(m=>console.log(m));
    } else {
      console.log(`${muniName}: OK`);
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
