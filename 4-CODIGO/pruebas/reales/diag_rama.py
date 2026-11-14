import sys, time
from comun import *
DOC = sys.argv[1]
J = "(id) => ({marca: NOM.ramas && NOM.ramas.marca ? NOM.ramas.marca(id) : 'sin NOM.ramas.marca', leer: NOM.leer(NOM.api.clave('sinred.' + id), null), uid: (NOM.api.usuario()||{}).id, activa: NOM.boveda.activa(), sinRed: NOM.editorActual.doc.sinRed, local: !!NOM.editorActual.doc.opc.local, soloMem: !!NOM.editorActual.doc.opc.soloMemoria})"
with sync_playwright() as pw:
    fl = Equipo(pw, "escritorio-flast1", cdp="http://localhost:9333")
    fl.abrir(DOC)
    print("antes:", fl.ev(J, DOC))
    fl.ctx.set_offline(True); time.sleep(1)
    fl.p.locator("[contenteditable=true]").first.click(); fl.p.keyboard.press("Control+End"); fl.p.keyboard.type(" x", delay=40)
    time.sleep(6); print("sin red 6 s:", fl.ev(J, DOC))
    fl.ev("(id) => NOM.editorActual.doc.marcarSinRed()", DOC); time.sleep(1)
    print("tras marcarSinRed():", fl.ev(J, DOC))
    fl.ctx.set_offline(False); time.sleep(8)
    print("con red:", fl.ev(J, DOC))
