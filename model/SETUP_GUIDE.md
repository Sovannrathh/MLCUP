# FIFA World Cup Predictor - Setup & Training Guide

## 📋 Overview
This system trains **4 different prediction targets** using **4 different ML models** each:

| Target | Type | Models |
|--------|------|--------|
| **Final Score** (Home/Away Goals) | Regression | Linear, Random Forest, Gradient Boosting, XGBoost |
| **Match Outcome** (Win/Draw/Loss) | Classification | Logistic Regression, Random Forest, Gradient Boosting, XGBoost |
| **Total Goals** | Regression | Linear, Random Forest, Gradient Boosting, XGBoost |
| **Goal Difference** | Regression | Linear, Random Forest, Gradient Boosting, XGBoost |

---

## 🚀 Quick Start

### 1. Download Data
- Go to: https://www.kaggle.com/datasets/piterfm/fifa-football-world-cup/data
- Download `FIFA_WC.csv`
- Place it in your project directory

### 2. Install Requirements
```bash
pip install pandas numpy scikit-learn xgboost
```

### 3. Run Training
```python
from fifa_world_cup_predictor import FIFAWorldCupPredictor

# Initialize
predictor = FIFAWorldCupPredictor(data_path='FIFA_WC.csv')

# Load → Engineer → Train
predictor.load_data()
predictor.engineer_features()
predictor.train_models(test_size=0.2)

# Save trained models
predictor.save_models('my_models.pkl')

# Make predictions
predictor.predict('Brazil', 'Germany')
```

---

## 🔍 Understanding the Output

### Training Output Example
```
1️⃣  Final Score Prediction (Home Goals & Away Goals)

   Predicting: home_goals
     Linear Regression: MAE=0.987, R²=0.421
     Random Forest: MAE=0.654, R²=0.718
     Gradient Boosting: MAE=0.589, R²=0.752
     XGBoost: MAE=0.543, R²=0.801
```

**What do these metrics mean?**
- **MAE (Mean Absolute Error)**: Average prediction error in goals. Lower = better.
- **R² Score**: How well the model explains variance (0-1). Higher = better.

### Prediction Output
```
🎯 Predicting: Brazil vs Germany
  home_goals: 2.34
  away_goals: 1.12
  outcome: Home Win (confidence: 0.95)
  total_goals: 3.46
  goal_difference: 1.22
```

---

## 🎯 Advanced Usage

### Train on Specific Time Period
```python
predictor.df_processed = predictor.df_processed[
    predictor.df_processed['year'] >= 2010
]
predictor.train_models()
```

### Use Only Certain Models
Edit `_train_regression_models()` to comment out unwanted models:
```python
models_to_try = {
    'Random Forest': RandomForestRegressor(...),
    'Gradient Boosting': GradientBoostingRegressor(...),
    # 'XGBoost': XGBRegressor(...),  # Skip XGBoost
}
```

### Custom Match Features
Modify `predict()` method to include:
- Betting odds
- ELO ratings
- Home advantage bias
- Recent form

---

## 📊 Feature Engineering Explained

The predictor creates these features automatically:

1. **Team Statistics**
   - `home_avg_goals_home`: Average goals scored at home
   - `away_avg_goals_away`: Average goals scored away
   - `home_avg_goals_total`: Career average goals
   - `total_games`: Matches played

2. **Time-based**
   - `year`: Match year (captures temporal trends)

These features are then **normalized** using StandardScaler for fair model comparison.

---

## 🔄 Retraining & Model Selection

### Automatic Best Model Selection
The system uses the **first trained model** as default. To manually select best:

```python
# Print all model performances
for target, models in predictor.models.items():
    print(f"\n{target}:")
    for name, metrics in models.items():
        print(f"  {name}: {metrics}")

# Use best model for prediction
best_model = predictor.models['home_goals']['XGBoost']['model']
prediction = best_model.predict(X_pred_scaled)
```

### Incremental Retraining
```python
# Add new match data to CSV
new_data = pd.DataFrame({...})
predictor.df = pd.concat([predictor.df, new_data])

# Re-engineer and retrain
predictor.engineer_features()
predictor.train_models()
```

---

## ⚠️ Common Issues

### Issue: "CSV not found"
**Solution**: Ensure `FIFA_WC.csv` is in the same directory as the script.

### Issue: Low R² scores
**Possible causes**:
- Dataset too small/noisy
- Missing relevant features (ELO, recent form, injuries)
- Model needs hyperparameter tuning

**Solutions**:
- Add more engineered features
- Tune model hyperparameters
- Collect higher-quality data

### Issue: Prediction errors for unknown teams
**Reason**: New teams aren't in training data.
**Solution**: The code falls back to average team stats (see `predict()` method).

---

## 📈 Next Steps

1. **Add ELO Ratings**: Incorporate FIFA/ELO ratings before matches
2. **Recent Form**: Calculate last 5 matches average
3. **Home Advantage**: Add binary home/away multiplier
4. **Ensemble Voting**: Average predictions from all 4 models
5. **Hyperparameter Tuning**: Use GridSearchCV for optimal parameters

---

## 📚 Files Included

- `fifa_world_cup_predictor.py` - Main predictor class
- `setup_guide.md` - This file
- `fifa_notebook.ipynb` - Jupyter notebook version (interactive)

---

**Happy predicting! ⚽**
