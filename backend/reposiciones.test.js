const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash, randomUUID } = require('node:crypto');
const { openDatabase } = require('./database');
const { createApp } = require('./server');

async function fixture() {
  const db=await openDatabase(':memory:');
  await db.run("INSERT INTO usuarios VALUES (1,'operador','Ana','fixture')");
  await db.run("INSERT INTO productos VALUES (1,'Producto existente',150,5,2)");
  const token=randomBytes(32).toString('hex');
  await db.run('INSERT INTO sesiones VALUES (?,1,?)',createHash('sha256').update(token).digest('hex'),Date.now()+60000);
  const server=createApp(db).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const call=async (path,body,auth=true) => {
    const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:body?'PUT':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,body:await r.json()};
  };
  return {db,call,close:async()=>{ await new Promise(resolve=>server.close(resolve)); await db.close(); }};
}
const entrada=()=>({cantidad:3,proveedor:' Distribuidora Salud ',fechaRecepcion:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),documento:'F001-10',costoUnitario:'1.25',observaciones:'Entrega revisada',clave:randomUUID()});

test('reposiciones: registra proveedor, responsable, costo e historial; reintentos concurrentes no duplican',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.call('/reposiciones',undefined,false)).status,401);
    const body=entrada();
    assert.equal((await f.call('/productos/1/reponer',body,false)).status,401);
    const resultados=await Promise.all([f.call('/productos/1/reponer',{...body,usuarioId:999,usuario:'Falso'}),f.call('/productos/1/reponer',body)]);
    assert.ok(resultados.every(r=>r.status===200));
    assert.equal(resultados.filter(r=>r.body.repetida).length,1);
    const historial=(await f.call('/reposiciones')).body;
    assert.equal(historial.length,1);
    assert.equal(historial[0].proveedor,'Distribuidora Salud');
    assert.equal(historial[0].usuarioId,1); assert.equal(historial[0].usuario,'Ana');
    assert.equal(historial[0].costoUnitarioCentavos,125);
    assert.equal(historial[0].stockAnterior,5); assert.equal(historial[0].stockPosterior,8);
    assert.equal((await f.db.get('SELECT stock FROM productos WHERE id=1')).stock,8);
    assert.equal((await f.call('/productos/1/reponer',{...body,cantidad:4})).status,409);
    const opcional=await f.call('/productos/1/reponer',{cantidad:1,proveedor:'Otro proveedor',fechaRecepcion:body.fechaRecepcion,clave:randomUUID()});
    assert.equal(opcional.status,200); assert.equal(opcional.body.reposicion.costoUnitarioCentavos,null);
    assert.equal((await f.db.get('SELECT precioCentavos FROM productos WHERE id=1')).precioCentavos,150);
  } finally { await f.close(); }
});

test('reposiciones: rechaza datos incompletos, fechas inválidas, costos y cantidades sin cambiar stock',async()=>{
  const f=await fixture();
  try {
    for(const cambios of [{proveedor:''},{proveedor:'x'.repeat(161)},{cantidad:0},{cantidad:1.5},{cantidad:'3'},{fechaRecepcion:'2026-02-30'},{fechaRecepcion:'2099-01-01'},{costoUnitario:'1.001'},{costoUnitario:-1},{costoUnitario:true},{documento:'x'.repeat(101)},{observaciones:'x'.repeat(1001)},{clave:''}]) {
      assert.equal((await f.call('/productos/1/reponer',{...entrada(),...cambios})).status,400,JSON.stringify(cambios));
    }
    assert.equal((await f.call('/productos/999/reponer',entrada())).status,404);
    assert.equal((await f.db.get('SELECT stock FROM productos WHERE id=1')).stock,5);
    assert.equal((await f.call('/reposiciones')).body.length,0);
  } finally { await f.close(); }
});

test('reposiciones: fallo al guardar el ingreso revierte el aumento de stock',async()=>{
  const f=await fixture();
  try {
    await f.db.run("CREATE TRIGGER fallar_ingreso BEFORE INSERT ON reposiciones BEGIN SELECT RAISE(ABORT,'fallo simulado'); END");
    assert.equal((await f.call('/productos/1/reponer',entrada())).status,500);
    assert.equal((await f.db.get('SELECT stock FROM productos WHERE id=1')).stock,5);
    assert.equal((await f.call('/reposiciones')).body.length,0);
    await f.db.run('DROP TRIGGER fallar_ingreso');
    assert.equal((await f.call('/productos/1/reponer',entrada())).status,200);
  } finally { await f.close(); }
});
