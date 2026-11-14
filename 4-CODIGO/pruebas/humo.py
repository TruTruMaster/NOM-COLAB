#!/usr/bin/env python3
"""Prueba de humo contra un servidor ya publicado (Azure, la Raspberry o el del salón): cuentas,
espacio, roles, los cuatro tipos de documento, escribir, leer, versiones, canal en vivo, chat,
almacenamiento, descargar mis datos, pase firmado. Crea 3 cuentas `humo_…` y las BORRA al final.

    NOM_BASE=https://nomcolab-wack.azurewebsites.net python3 pruebas/humo.py
    NOM_BASE=https://nomcolab.dpdns.org python3 pruebas/humo.py
"""
import json,urllib.request,os,random,string,time,base64,sys
B=os.environ.get("NOM_BASE","http://localhost:8099").rstrip("/"); AG={"User-Agent":"NOM-COLAB-pruebas/1.0"}
CL="Humo-"+"".join(random.choice(string.ascii_letters) for _ in range(10)); SUF="".join(random.choice("abcdefghjkmnpqrstuvwxyz") for _ in range(4))
res=[]
def r(m,u,b=None,t=None):
    h=dict(AG,**{"Content-Type":"application/json"})
    if t:h["Authorization"]="Bearer "+t
    q=urllib.request.Request(B+u,method=m,data=json.dumps(b).encode() if b is not None else None,headers=h)
    try:
        with urllib.request.urlopen(q,timeout=90) as x:
            c=x.read(); return x.status,(json.loads(c) if c[:1] in b"{[" else c)
    except urllib.error.HTTPError as e: return e.code,e.read()[:200]
def ok(n,c): res.append((n,c)); print(("OK   " if c else "FALLA"),n,flush=True)
tk={}
for n in ("a","b","c"):
    s=r("POST","/api/cuentas/registro",{"nombre":f"humo_{SUF}_{n}","contrasena":CL,"acepto":"2026-11-13"}); ok(f"registro {n} ({s[0]})",s[0] in(200,201))
    s=r("POST","/api/cuentas/sesion",{"nombre":f"humo_{SUF}_{n}","contrasena":CL}); ok(f"sesión {n}",s[0]==200); tk[n]=s[1]["token"]
ok("mal contraseña 401",r("POST","/api/cuentas/sesion",{"nombre":f"humo_{SUF}_a","contrasena":"otra-cosa-123"})[0]==401)
alm=r("GET","/api/cuentas/almacenamiento",t=tk["a"]); ok(f"almacenamiento con cuota {alm[1].get('cuota') if alm[0]==200 else alm}",alm[0]==200)
e=r("POST","/api/espacios",{"nombre":"Humo"},tk["a"]); ok("crear espacio",e[0] in(200,201)); e=e[1]["id"]
ok("dar edición a b",r("PUT",f"/api/espacios/{e}/accesos",{"usuario":f"humo_{SUF}_b","permiso":"EDICION"},tk["a"])[0]==200)
ok("dar lectura a c",r("PUT",f"/api/espacios/{e}/accesos",{"usuario":f"humo_{SUF}_c","permiso":"LECTURA"},tk["a"])[0]==200)
for modo in ("TEXTO","HOJA","PRESENTACION","DIAGRAMA"):
    d=r("POST",f"/api/espacios/{e}/documentos",{"nombre":modo,"modo":modo,"ops":[]},tk["a"]); ok(f"crear {modo}",d[0] in(200,201))
d=r("POST",f"/api/espacios/{e}/documentos",{"nombre":"Acta","modo":"TEXTO","ops":[]},tk["a"])[1]["id"]
op=lambda c,t,x:{"ops":[{"id":f"{c}:{t}","t":t,"n":c,"campos":{},"bloque":"cuerpo","s":{"k":"i","iz":None,"x":x}}],"cliente":c,"dispositivo":"humo"}
ok("b escribe",r("POST",f"/api/documentos/{d}/ops",op("hb",1,"Hola "),tk["b"])[0]==200)
ok("c (lectura) no escribe 403",r("POST",f"/api/documentos/{d}/ops",op("hc",1,"x"),tk["c"])[0]==403)
g=r("GET",f"/api/documentos/{d}",t=tk["c"]); ok("c lee el texto", g[0]==200 and "Hola" in json.dumps(g[1]["estado"]))
ok("guardar versión",r("POST",f"/api/documentos/{d}/versiones",{"nombre":"v1"},tk["a"])[0] in(200,201))
ok("ver versiones",r("GET",f"/api/documentos/{d}/versiones",t=tk["a"])[0]==200)
bol=r("POST","/api/cuentas/boleto",{},tk["b"])[1]["boleto"]
try:
    x=urllib.request.urlopen(urllib.request.Request(B+f"/api/espacios/{e}/eventos?boleto={bol}&cliente=hb",headers=dict(AG,Accept="text/event-stream")),timeout=30); ok("canal en vivo abre",x.status==200); x.close()
except Exception as ex: ok(f"canal en vivo abre ({ex})",False)
ch=r("POST",f"/api/espacios/{e}/chat",{"texto":"hola equipo"},tk["b"]); ok(f"chat enviar ({ch[0]})",ch[0] in(200,201))
ok("chat leer",r("GET",f"/api/espacios/{e}/chat",t=tk["a"])[0]==200)
ok("descargar mis datos",r("GET","/api/cuentas/datos",t=tk["b"])[0]==200)
ok("llave pública de pases",r("GET","/api/cuentas/pase/llave")[0]==200)
pa=r("POST","/api/cuentas/pase",{},tk["b"]); ok(f"pase firmado ({pa[0]})",pa[0] in(200,201))
ok("borrar doc a papelera",r("DELETE",f"/api/documentos/{d}",t=tk["a"])[0]==200)
for n in ("a","b","c"):
    ok(f"borrar cuenta {n}",r("POST","/api/cuentas/eliminar",{"contrasena":CL,"confirmacion":"BORRAR"},tk[n])[0]==200)
f=[n for n,c in res if not c]; print(f"\n{len(res)-len(f)} de {len(res)}", "FALLAS:"+str(f) if f else ""); sys.exit(1 if f else 0)
