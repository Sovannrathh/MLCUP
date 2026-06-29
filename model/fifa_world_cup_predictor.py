"""
FIFA World Cup Score Predictor - Multi-Model Training Framework
Predicts: Final Score, Winner/Draw/Loser, Total Goals, Goal Difference
"""

import pandas as pd
import numpy as np
import pickle
from pathlib import Path
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import mean_squared_error, mean_absolute_error, accuracy_score, classification_report, r2_score
from xgboost import XGBRegressor, XGBClassifier
import warnings
warnings.filterwarnings('ignore')

class FIFAWorldCupPredictor:
    def __init__(self, data_path='FIFA_WC.csv'):
        """
        Initialize predictor with dataset.
        Download from: https://www.kaggle.com/datasets/piterfm/fifa-football-world-cup/data
        """
        self.data_path = data_path
        self.df = None
        self.models = {}
        self.scalers = {}
        self.label_encoders = {}
        
    def load_data(self):
        """Load and display FIFA World Cup data"""
        print("📊 Loading FIFA World Cup data...")
        self.df = pd.read_csv(self.data_path)
        print(f"Dataset shape: {self.df.shape}")
        print(f"\nColumns: {self.df.columns.tolist()}")
        print(f"\nFirst few rows:\n{self.df.head()}")
        return self.df
    
    def engineer_features(self):
        """Create features for prediction"""
        print("\n🔧 Engineering features...")
        
        df = self.df.copy()
        
        # Create target variables
        df['home_goals'] = df['Home Team Goals']
        df['away_goals'] = df['Away Team Goals']
        df['total_goals'] = df['home_goals'] + df['away_goals']
        df['goal_difference'] = df['home_goals'] - df['away_goals']
        
        # Outcome: 2=Home Win, 1=Draw, 0=Away Win (non-negative integers required by XGBoost)
        df['outcome'] = df['goal_difference'].apply(lambda x: 2 if x > 0 else (1 if x == 0 else 0))
        
        # Parse year from date
        df['year'] = pd.to_datetime(df['DateTime']).dt.year
        
        # Calculate team statistics
        team_stats = self._calculate_team_stats(df)
        
        # Merge team stats for home and away teams
        df = df.merge(team_stats.add_prefix('home_'), 
                     left_on='Home Team Name', right_on='home_team', how='left')
        df = df.merge(team_stats.add_prefix('away_'), 
                     left_on='Away Team Name', right_on='away_team', how='left')
        
        # Fill NaN values
        df = df.fillna(df.mean(numeric_only=True))
        
        # Select features for modeling
        feature_cols = [col for col in df.columns if any(x in col for x in 
                       ['home_avg', 'away_avg', 'home_total', 'away_total', 'year'])]
        
        self.features = feature_cols
        self.df_processed = df
        print(f"✓ Created {len(feature_cols)} features")
        return df, feature_cols
    
    def _calculate_team_stats(self, df):
        """Calculate cumulative team statistics"""
        stats = {}
        
        for team in set(df['Home Team Name'].unique()) | set(df['Away Team Name'].unique()):
            home_games = df[df['Home Team Name'] == team]
            away_games = df[df['Away Team Name'] == team]
            
            home_goals = home_games['Home Team Goals'].sum()
            home_games_played = len(home_games)
            away_goals = away_games['Away Team Goals'].sum()
            away_games_played = len(away_games)
            
            total_goals = home_goals + away_goals
            total_games = home_games_played + away_games_played
            
            stats[team] = {
                'team': team,
                'avg_goals_home': home_goals / max(home_games_played, 1),
                'avg_goals_away': away_goals / max(away_games_played, 1),
                'avg_goals_total': total_goals / max(total_games, 1),
                'total_games': total_games
            }
        
        return pd.DataFrame.from_dict(stats, orient='index')
    
    def train_models(self, test_size=0.2):
        """Train multiple models for all prediction targets"""
        print("\n🤖 Training multiple models...\n")
        
        X = self.df_processed[self.features]
        
        # Normalize features
        self.scalers['X'] = StandardScaler()
        X_scaled = self.scalers['X'].fit_transform(X)
        X_train, X_test, _, y_test_indices = train_test_split(
            X_scaled, np.arange(len(X)), test_size=test_size, random_state=42
        )
        y_test = self.df_processed.iloc[y_test_indices]
        
        # 1. FINAL SCORE PREDICTION (Regression)
        print("1️⃣  Final Score Prediction (Home Goals & Away Goals)")
        self._train_regression_models(X_train, X_test, y_test, 'home_goals', 'away_goals')
        
        # 2. OUTCOME PREDICTION (Classification: Win/Draw/Loss)
        print("\n2️⃣  Match Outcome Prediction (Home Win / Draw / Away Win)")
        self._train_classification_models(X_train, X_test, y_test, 'outcome')
        
        # 3. TOTAL GOALS PREDICTION (Regression)
        print("\n3️⃣  Total Goals Prediction")
        self._train_regression_models(X_train, X_test, y_test, 'total_goals')
        
        # 4. GOAL DIFFERENCE PREDICTION (Regression)
        print("\n4️⃣  Goal Difference Prediction")
        self._train_regression_models(X_train, X_test, y_test, 'goal_difference')
        
        print("\n✅ All models trained successfully!")
        return self.models
    
    def _train_regression_models(self, X_train, X_test, y_test, *targets):
        """Train multiple regression models"""
        models_to_try = {
            'Linear Regression': LinearRegression(),
            'Random Forest': RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            'Gradient Boosting': GradientBoostingRegressor(n_estimators=100, random_state=42),
            'XGBoost': XGBRegressor(n_estimators=100, random_state=42, verbosity=0)
        }
        
        for target in targets:
            y_train = self.df_processed.iloc[:len(X_train)][target].values
            y_test_target = y_test[target].values
            
            print(f"\n   Predicting: {target}")
            target_models = {}
            
            for model_name, model in models_to_try.items():
                try:
                    model.fit(X_train, y_train)
                    y_pred = model.predict(X_test)
                    
                    mse = mean_squared_error(y_test_target, y_pred)
                    mae = mean_absolute_error(y_test_target, y_pred)
                    r2 = r2_score(y_test_target, y_pred)
                    
                    target_models[model_name] = {
                        'model': model,
                        'mse': mse,
                        'mae': mae,
                        'r2': r2
                    }
                    
                    print(f"     {model_name}: MAE={mae:.3f}, R²={r2:.3f}")
                except Exception as e:
                    print(f"     {model_name}: Error - {str(e)}")
            
            self.models[target] = target_models
    
    def _train_classification_models(self, X_train, X_test, y_test, target):
        """Train multiple classification models"""
        models_to_try = {
            'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
            'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
            'Gradient Boosting': GradientBoostingClassifier(n_estimators=100, random_state=42),
            'XGBoost': XGBClassifier(n_estimators=100, random_state=42, verbosity=0)
        }
        
        y_train = self.df_processed.iloc[:len(X_train)][target].values
        y_test_target = y_test[target].values
        
        print(f"\n   Predicting: {target}")
        target_models = {}
        
        for model_name, model in models_to_try.items():
            try:
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                accuracy = accuracy_score(y_test_target, y_pred)
                
                target_models[model_name] = {
                    'model': model,
                    'accuracy': accuracy
                }
                
                print(f"     {model_name}: Accuracy={accuracy:.3f}")
            except Exception as e:
                print(f"     {model_name}: Error - {str(e)}")
        
        self.models[target] = target_models
    
    def predict(self, home_team, away_team):
        """Make predictions for a match"""
        print(f"\n🎯 Predicting: {home_team} vs {away_team}")
        
        # Get team stats
        team_stats = self._calculate_team_stats(self.df_processed)
        
        home_stats = team_stats.loc[home_team] if home_team in team_stats.index else team_stats.mean()
        away_stats = team_stats.loc[away_team] if away_team in team_stats.index else team_stats.mean()
        
        # Create feature vector
        features = []
        for col in self.features:
            if 'home_' in col:
                features.append(home_stats[col.replace('home_', '')])
            elif 'away_' in col:
                features.append(away_stats[col.replace('away_', '')])
            else:
                features.append(self.df_processed[col].mean())
        
        X_pred = np.array(features).reshape(1, -1)
        X_pred_scaled = self.scalers['X'].transform(X_pred)
        
        predictions = {}
        
        # Predict each target
        for target, models_dict in self.models.items():
            best_model_name = list(models_dict.keys())[0]
            best_model = models_dict[best_model_name]['model']
            
            pred = best_model.predict(X_pred_scaled)[0]
            predictions[target] = pred
            
            if target == 'outcome':
                outcome_map = {2: 'Home Win', 1: 'Draw', 0: 'Away Win'}
                print(f"  {target}: {outcome_map.get(round(pred), 'Unknown')} (confidence: {abs(pred):.2f})")
            else:
                print(f"  {target}: {pred:.2f}")
        
        return predictions
    
    def save_models(self, path='world_cup_models.pkl'):
        """Save trained models"""
        with open(path, 'wb') as f:
            pickle.dump({
                'models': self.models,
                'scalers': self.scalers,
                'features': self.features
            }, f)
        print(f"\n💾 Models saved to {path}")
    
    def load_models(self, path='world_cup_models.pkl'):
        """Load pre-trained models"""
        with open(path, 'rb') as f:
            data = pickle.load(f)
        self.models = data['models']
        self.scalers = data['scalers']
        self.features = data['features']
        print(f"✓ Models loaded from {path}")


# ============================================================================
# USAGE EXAMPLE
# ============================================================================

if __name__ == "__main__":
    # Initialize predictor
    predictor = FIFAWorldCupPredictor(data_path='FIFA_WC.csv')
    
    # Step 1: Load data
    predictor.load_data()
    
    # Step 2: Engineer features
    predictor.engineer_features()
    
    # Step 3: Train models
    predictor.train_models(test_size=0.2)
    
    # Step 4: Save models for later use
    predictor.save_models()
    
    # Step 5: Make predictions
    predictor.predict('Brazil', 'Germany')
    predictor.predict('France', 'Argentina')
    predictor.predict('England', 'Spain')
