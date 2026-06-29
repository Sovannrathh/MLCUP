import json, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

with open("D:/MLCUP/FIFA_WorldCup_Predictor.ipynb", encoding="utf-8") as f:
    nb = json.load(f)

errors = []

# ═══════════════════════════════════════════════════════════════
# PATCH 1: Cell 14 — add 6 new difference features
# ═══════════════════════════════════════════════════════════════
c14 = "".join(nb["cells"][14]["source"])
old14 = "# Form differential\ndf_processed['form_goal_diff'] = df_processed['home_form_goals'] - df_processed['away_form_goals']\n\ndf_processed = df_processed.fillna(df_processed.mean(numeric_only=True))"
new14 = ("# Form differential\n"
         "df_processed['form_goal_diff']      = df_processed['home_form_goals']    - df_processed['away_form_goals']\n"
         "df_processed['form_conceded_diff']  = df_processed['home_form_conceded'] - df_processed['away_form_conceded']\n"
         "df_processed['form_winrate_diff']   = df_processed['home_form_winrate']  - df_processed['away_form_winrate']\n"
         "\n"
         "# Neutral-venue stat differences (key for removing positional bias)\n"
         "df_processed['goals_diff']     = df_processed['home_avg_goals_total']    - df_processed['away_avg_goals_total']\n"
         "df_processed['conceded_diff']  = df_processed['home_avg_conceded_total'] - df_processed['away_avg_conceded_total']\n"
         "df_processed['win_rate_diff']  = df_processed['home_win_rate']  - df_processed['away_win_rate']\n"
         "df_processed['draw_rate_diff'] = df_processed['home_draw_rate'] - df_processed['away_draw_rate']\n"
         "\n"
         "df_processed = df_processed.fillna(df_processed.mean(numeric_only=True))")
if old14 in c14:
    nb["cells"][14]["source"] = [c14.replace(old14, new14)]
    print("Cell 14 patched: 6 new diff features added")
else:
    errors.append("Cell 14 pattern not found")

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Cell 15 — add new diff features to feature_cols
# ═══════════════════════════════════════════════════════════════
c15 = "".join(nb["cells"][15]["source"])
old15 = "    # Head-to-head history"
new15 = ("    # Difference-based features (neutral-venue, symmetric)\n"
         "    'goals_diff', 'conceded_diff',\n"
         "    'win_rate_diff', 'draw_rate_diff',\n"
         "    'form_conceded_diff', 'form_winrate_diff',\n"
         "    # Head-to-head history")
if old15 in c15:
    nb["cells"][15]["source"] = [c15.replace(old15, new15)]
    print("Cell 15 patched: 6 diff features added to feature_cols")
else:
    errors.append("Cell 15 pattern not found")

# ═══════════════════════════════════════════════════════════════
# PATCH 3: Cell 17 — replace with swap-augmented version
# ═══════════════════════════════════════════════════════════════
new_c17 = (
    "from collections import Counter\n"
    "\n"
    "# Stratified split preserves Win/Draw/Loss class balance\n"
    "sss = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=42)\n"
    "for indices_train, indices_test in sss.split(X, df_processed['outcome']):\n"
    "    pass\n"
    "\n"
    "X_train_raw = X.iloc[indices_train].reset_index(drop=True)\n"
    "X_test_raw  = X.iloc[indices_test].reset_index(drop=True)\n"
    "y_train_df  = df_processed.iloc[indices_train].reset_index(drop=True)\n"
    "y_test_df   = df_processed.iloc[indices_test].reset_index(drop=True)\n"
    "\n"
    "# Swap augmentation: mirror every training match (home <-> away)\n"
    "# Forces the model to learn symmetric weights and kills positional bias.\n"
    "_swap_pairs = [\n"
    "    ('home_avg_goals_total',    'away_avg_goals_total'),\n"
    "    ('home_avg_conceded_total', 'away_avg_conceded_total'),\n"
    "    ('home_win_rate',           'away_win_rate'),\n"
    "    ('home_draw_rate',          'away_draw_rate'),\n"
    "    ('home_total_games',        'away_total_games'),\n"
    "    ('home_elo',                'away_elo'),\n"
    "    ('home_squad_age',          'away_squad_age'),\n"
    "    ('home_form_goals',         'away_form_goals'),\n"
    "    ('home_form_conceded',      'away_form_conceded'),\n"
    "    ('home_form_winrate',       'away_form_winrate'),\n"
    "]\n"
    "_negate = ['goals_diff','conceded_diff','win_rate_diff','draw_rate_diff',\n"
    "           'elo_diff','form_goal_diff','form_conceded_diff','form_winrate_diff','age_diff']\n"
    "\n"
    "X_swap = X_train_raw.copy()\n"
    "for hc, ac in _swap_pairs:\n"
    "    if hc in X_swap.columns and ac in X_swap.columns:\n"
    "        X_swap[hc], X_swap[ac] = X_train_raw[ac].values.copy(), X_train_raw[hc].values.copy()\n"
    "for dc in _negate:\n"
    "    if dc in X_swap.columns:\n"
    "        X_swap[dc] = -X_train_raw[dc].values\n"
    "if 'elo_win_prob' in X_swap.columns:\n"
    "    X_swap['elo_win_prob'] = 1 - X_train_raw['elo_win_prob'].values\n"
    "if 'h2h_home_win_rate' in X_swap.columns:\n"
    "    X_swap['h2h_home_win_rate'] = 1 - X_train_raw['h2h_home_win_rate'].values\n"
    "if 'h2h_home_goals' in X_swap.columns and 'h2h_away_goals' in X_swap.columns:\n"
    "    X_swap['h2h_home_goals'] = X_train_raw['h2h_away_goals'].values.copy()\n"
    "    X_swap['h2h_away_goals'] = X_train_raw['h2h_home_goals'].values.copy()\n"
    "\n"
    "y_swap = y_train_df.copy()\n"
    "y_swap['home_goals']      = y_train_df['away_goals'].values\n"
    "y_swap['away_goals']      = y_train_df['home_goals'].values\n"
    "y_swap['total_goals']     = y_train_df['total_goals'].values\n"
    "y_swap['goal_difference'] = -y_train_df['goal_difference'].values\n"
    "y_swap['outcome']         = y_train_df['outcome'].map({2: 0, 1: 1, 0: 2})\n"
    "\n"
    "X_train_aug = pd.concat([X_train_raw, X_swap], ignore_index=True)\n"
    "y_train_df  = pd.concat([y_train_df,  y_swap],  ignore_index=True)\n"
    "\n"
    "scaler  = StandardScaler()\n"
    "X_train = scaler.fit_transform(X_train_aug)\n"
    "X_test  = scaler.transform(X_test_raw)\n"
    "\n"
    "outcome_map = {2: 'Home Win', 1: 'Draw', 0: 'Away Win'}\n"
    "train_dist  = Counter(y_train_df['outcome'])\n"
    "test_dist   = Counter(y_test_df['outcome'])\n"
    "print(f'\\u2713 Stratified 80/20 split + swap augmentation (training doubled to {X_train.shape[0]} samples)')\n"
    "print(f'  Train: {X_train.shape}  |  Test: {X_test.shape}')\n"
    "print(f'  Train dist: { {outcome_map[k]: v for k,v in sorted(train_dist.items())} }')\n"
    "print(f'  Test  dist: { {outcome_map[k]: v for k,v in sorted(test_dist.items())} }')\n"
)
nb["cells"][17]["source"] = [new_c17]
print("Cell 17 patched: swap augmentation added")

# ═══════════════════════════════════════════════════════════════
# PATCH 4: Cell 28 — add new diff feature handling in predict_match
# ═══════════════════════════════════════════════════════════════
c28 = "".join(nb["cells"][28]["source"])
old28 = "        elif col == 'form_goal_diff':     row[col] = hfg - afg"
new28 = ("        elif col == 'form_goal_diff':     row[col] = hfg - afg\n"
         "        elif col == 'form_conceded_diff': row[col] = hfc - afc\n"
         "        elif col == 'form_winrate_diff':  row[col] = hfw - afw\n"
         "        elif col == 'goals_diff':         row[col] = hs.get('avg_goals_total', 1.2)    - as_.get('avg_goals_total', 1.2)\n"
         "        elif col == 'conceded_diff':      row[col] = hs.get('avg_conceded_total', 1.0) - as_.get('avg_conceded_total', 1.0)\n"
         "        elif col == 'win_rate_diff':      row[col] = hs.get('win_rate', 0.5)  - as_.get('win_rate', 0.5)\n"
         "        elif col == 'draw_rate_diff':     row[col] = hs.get('draw_rate', 0.25) - as_.get('draw_rate', 0.25)")
if old28 in c28:
    nb["cells"][28]["source"] = [c28.replace(old28, new28)]
    print("Cell 28 patched: diff features handled in predict_match")
else:
    errors.append("Cell 28 pattern not found")

# ═══════════════════════════════════════════════════════════════
if errors:
    print("\nERRORS:")
    for e in errors:
        print(f"  {e}")
else:
    with open("D:/MLCUP/FIFA_WorldCup_Predictor.ipynb", "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print("\nAll 4 patches applied and saved.")