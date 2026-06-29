import json

with open("D:/MLCUP/FIFA_WorldCup_Predictor.ipynb", encoding="utf-8") as f:
    nb = json.load(f)

cell = nb["cells"][28]
src = "".join(cell["source"])

old = "    # Weighted blend\n    W_CLS, W_ELO, W_REG = 0.50, 0.35, 0.15\n    blended = {k: W_CLS * avg_probs[k] + W_ELO * elo_probs[k] + W_REG * reg_probs[k]\n               for k in [0, 1, 2]}"

new = "    # Dynamic blending: when ELO gap is large, trust ELO more over the classifier.\n    # Classifier learned home-team patterns from historical WC data and can be\n    # overconfident when the listed home team is actually the ELO underdog.\n    _elo_gap_factor = min(1.0, elo_diff_abs / 400)   # 0.0 at 0pts gap, 1.0 at 400pts\n    W_CLS = 0.50 - 0.20 * _elo_gap_factor            # 0.50 -> 0.30\n    W_ELO = 0.35 + 0.15 * _elo_gap_factor            # 0.35 -> 0.50\n    W_REG = 0.15 + 0.05 * _elo_gap_factor            # 0.15 -> 0.20\n    blended = {k: W_CLS * avg_probs[k] + W_ELO * elo_probs[k] + W_REG * reg_probs[k]\n               for k in [0, 1, 2]}"

if old in src:
    new_src = src.replace(old, new)
    cell["source"] = [new_src]
    with open("D:/MLCUP/FIFA_WorldCup_Predictor.ipynb", "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print("Patched successfully.")
else:
    print("ERROR: old string not found.")
    # Debug: show what we have around that area
    idx = src.find("W_CLS")
    print(repr(src[max(0,idx-100):idx+300]))