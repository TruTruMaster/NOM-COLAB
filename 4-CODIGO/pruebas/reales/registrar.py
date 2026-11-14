import a55, time, json, os, sys
def salir():
    a55.tocar(863, 2216); time.sleep(1.2)
    a55.tocar('Cerrar sesión'); time.sleep(1.5)
    n = a55.buscar('Cerrar sesión')
    if n: a55.tocar(n['cx'], n['cy']); time.sleep(2)
def registrar(usuario, aceptar=True):
    if not a55.buscar('Crear cuenta'): a55.tocar('Crea tu cuenta en un minuto')
    else: a55.tocar('Crear cuenta')
    time.sleep(1.2)
    ed = [n for n in a55.nodos() if n['c'] == 'EditText']
    if len(ed) < 3: print('campos', len(ed)); return None
    a55.tocar(ed[0]['cx'], ed[0]['cy']); a55.sh('input keycombination 113 29'); a55.tecla(67); a55.escribir(usuario)
    a55.tocar(ed[1]['cx'], ed[1]['cy']); a55.sh('input keycombination 113 29'); a55.tecla(67); a55.escribir(json.load(open(os.path.expanduser("~/.cache/nom-pruebas/cuentas-prueba.json")))["_nuevas"])
    t = a55.buscar('Crea tu cuenta')
    if t: a55.tocar(t['cx'], t['cy'])
    else: a55.tecla(111)
    time.sleep(0.8)
    if aceptar:
        cb = [n for n in a55.nodos() if 'Check' in n['c']]
        if not cb: print('sin casilla'); return None
        a55.tocar(cb[0]['cx'], cb[0]['cy'])
    bt = [n for n in a55.nodos() if n['t'] == 'Crear cuenta' and n['c'] == 'Button']
    a55.tocar(bt[0]['cx'], bt[0]['cy']); time.sleep(4)
    txt = [n['t'] for n in a55.nodos() if n['t']]
    cod = [t for t in txt if len(t) == 19 and t.count('-') == 3]
    if cod:
        a55.tocar('Ya lo guardé'); time.sleep(2.5)
        return 'CREADA ' + cod[0]
    return 'NO: ' + ' | '.join(t for t in txt if any(k in t.lower() for k in ('demasiad', 'acept', 'error', 'no se', 'intenta', 'dispositivo', 'términos', 'espera')))[:400]
if __name__ == '__main__':
    if a55.buscar('Buenos') or a55.buscar('Buenas'): salir()
    for u in sys.argv[1:]:
        acepta = not u.endswith('-sin')
        u = u.replace('-sin', '')
        r = registrar(u, acepta)
        print(u, '=>', r, flush=True)
        if r and r.startswith('CREADA'): salir()
