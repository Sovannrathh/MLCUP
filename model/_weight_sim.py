import numpy as np

def blend_old(cls_home, elo_home, reg_home):
    return 0.50*cls_home + 0.35*elo_home + 0.15*reg_home

def blend_new(cls_home, elo_home, reg_home, elo_gap):
    f = min(1.0, elo_gap / 400)
    W_CLS = 0.50 - 0.20*f
    W_ELO = 0.35 + 0.15*f
    W_REG = 0.15 + 0.05*f
    return W_CLS*cls_home + W_ELO*elo_home + W_REG*reg_home

scenarios = [
    ("ELO gap=0   (Brazil vs France)",     0),
    ("ELO gap=100 (small mismatch)",       100),
    ("ELO gap=188 (SAF vs CAN)",           188),
    ("ELO gap=300 (Argentina vs Haiti)",   300),
]

for label, gap in scenarios:
    f = min(1.0, gap/400)
    W_CLS = 0.50 - 0.20*f
    W_ELO = 0.35 + 0.15*f
    W_REG = 0.15 + 0.05*f
    elo_fav = 1 / (1 + 10**(gap/400))  # underdog-as-home win prob
    # Worst case: classifier says 60% home (underdog), ELO says underdog ~25-50%
    cls_h = 0.60
    reg_h = 0.45
    old_h = blend_old(cls_h, elo_fav, reg_h)
    new_h = blend_new(cls_h, elo_fav, reg_h, gap)
    old_pick = "Home (WRONG)" if elo_fav < 0.5 and old_h > 0.5 else ("Away (correct)" if elo_fav < 0.5 else "Home (correct)")
    new_pick = "Home (WRONG)" if elo_fav < 0.5 and new_h > 0.5 else ("Away (correct)" if elo_fav < 0.5 else "Home (correct)")
    print(f"{label}")
    print(f"  Weights  Old: CLS={0.50:.2f} ELO={0.35:.2f} REG={0.15:.2f}  |  New: CLS={W_CLS:.2f} ELO={W_ELO:.2f} REG={W_REG:.2f}")
    print(f"  ELO home win prob: {elo_fav:.1%}")
    print(f"  Old blend: {old_h:.1%} -> {old_pick}")
    print(f"  New blend: {new_h:.1%} -> {new_pick}")
    print()