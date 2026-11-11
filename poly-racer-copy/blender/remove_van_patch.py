# The van leaves the game: out of the garage, the computer's cars and the model list; a save that had it falls back
# to the first car (carById already does that), and so does an online player still in one.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
import re
line = [l for l in s.split('\n') if l.startswith("  { id: 'van',    name: 'Hauler Van'")]
assert len(line) == 1
rep(line[0] + '\n', '')
rep("""const MODELS = {}, MODEL_IDS = ['sedan', 'hatch', 'suv', 'van', 'muscle', 'sports', 'pickup', 'coupe', 'super'];""",
    """const MODELS = {}, MODEL_IDS = ['sedan', 'hatch', 'suv', 'muscle', 'sports', 'pickup', 'coupe', 'super'];""")
rep("""van: 'Mercedes-Benz Sprinter', """, "")
rep("""\"Mercedes-AMG E 63 S (W213)\" by Car2022 and \"2019 Mercedes-Benz Sprinter\" by tonielpro520.""", """\"Mercedes-AMG E 63 S (W213)\" by Car2022.""")
rep("""\"2013 Ford F-150\" by supercarmodels, \"Mercedes-AMG E 63 S (W213)\" by Car2022.""", """\"2013 Ford F-150\" by supercarmodels and \"Mercedes-AMG E 63 S (W213)\" by Car2022.""")
rep("""<li>Nine real cars, modelled in detail inside and out""", """<li>Eight real cars, modelled in detail inside and out""")
open(p, 'w').write(s); print('van removed')
