import base64, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.print_page_options import PrintOptions
entrada, salida, ancho_cm, alto_cm = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
op = Options(); op.add_argument("--headless"); op.binary_location = "/usr/bin/librewolf"
op.set_preference("privacy.resistFingerprinting", False)
d = webdriver.Firefox(options=op)
d.get("file://" + entrada); time.sleep(3)
d.execute_script("return document.fonts.ready.then(()=>1)")
po = PrintOptions(); po.page_width = ancho_cm; po.page_height = alto_cm; po.margin_top = po.margin_bottom = po.margin_left = po.margin_right = 0
po.background = True; po.shrink_to_fit = False; po.scale = 1.0
open(salida, "wb").write(base64.b64decode(d.print_page(po))); d.quit(); print("ok", salida)
