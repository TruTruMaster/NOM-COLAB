import a55, time, json, os, sys
def entrar(u, c=None):
    c = c or json.load(open(os.path.expanduser("~/.cache/nom-pruebas/cuentas-prueba.json"))).get(u)
    a55.tocar(540, 150); a55.tecla(111)
    for i in range(3): a55.deslizar(540, 500, 540, 1300, 250)
    if not a55.buscar('Hola de nuevo'):
        n = a55.buscar('Iniciar sesión')
        if n: a55.tocar(n['cx'], n['cy']); time.sleep(1)
    ed = [n for n in a55.nodos() if n['c'] == 'EditText']
    a55.tocar(ed[0]['cx'], ed[0]['cy']); a55.sh('input keycombination 113 29'); a55.tecla(67); a55.escribir(u)
    a55.tocar(ed[1]['cx'], ed[1]['cy']); a55.sh('input keycombination 113 29'); a55.tecla(67); a55.escribir(c)
    a55.tecla(66); time.sleep(4)
    return bool(a55.buscar('Buen'))
if __name__ == '__main__':
    print(entrar(sys.argv[1]))
