"""
Train the Ad Detection Model
Generates synthetic training data based on real-world ad patterns
"""

import numpy as np
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
import random

def generate_training_data(n_samples=5000):
    """
    Generate synthetic training data based on real ad patterns
    
    Returns:
        X: Feature matrix (n_samples, 10 features)
        y: Labels (0=not ad, 1=ad)
    """
    
    X = []
    y = []
    
    # Generate positive examples (ads)
    n_ads = int(n_samples * 0.4)  # 40% ads (realistic ratio)
    
    for _ in range(n_ads):
        # Ads typically have:
        # - Keywords in ID/class (high probability)
        # - Often iframes
        # - Standard ad dimensions
        # - Moderate to large areas
        
        has_keyword = random.random() < 0.85  # 85% of ads have keywords
        is_iframe = random.random() < 0.4     # 40% are iframes
        
        # Ad dimensions (common sizes)
        ad_sizes = [
            (728, 90),    # Leaderboard
            (300, 250),   # Medium rectangle
            (336, 280),   # Large rectangle
            (300, 600),   # Half page
            (160, 600),   # Wide skyscraper
            (320, 50),    # Mobile banner
            (320, 100),   # Large mobile banner
            (970, 250),   # Billboard
        ]
        
        if random.random() < 0.7:  # 70% use standard sizes
            width, height = random.choice(ad_sizes)
            # Add some variance
            width += random.randint(-20, 20)
            height += random.randint(-10, 10)
        else:  # 30% have non-standard sizes
            width = random.randint(200, 1000)
            height = random.randint(50, 400)
        
        width = max(50, width)
        height = max(20, height)
        area = width * height
        
        # Keyword source (ID is strongest signal for ads)
        if has_keyword:
            source_weights = [3, 3, 2, 1]  # id, id, class, text
            keyword_source = random.choices([3, 3, 2, 1], source_weights)[0]
        else:
            keyword_source = 0
        
        # Aspect ratio
        aspect_ratio = min(width / height, 10) if height > 0 else 0
        
        # Banner sized
        is_banner = (
            (width >= 728 and height >= 90) or
            (width >= 300 and height >= 250) or
            (width >= 160 and height >= 600) or
            (width >= 320 and height >= 50)
        )
        
        # Large area
        is_large = area > 100000
        
        # Tag score (ads often in iframes or divs)
        if is_iframe:
            tag_score = 3
        elif random.random() < 0.7:
            tag_score = 2  # div
        else:
            tag_score = random.choice([1, 1, 0])  # img, section, other
        
        features = [
            1 if has_keyword else 0,
            1 if is_iframe else 0,
            width,
            height,
            area,
            keyword_source,
            aspect_ratio,
            1 if is_banner else 0,
            1 if is_large else 0,
            tag_score
        ]
        
        X.append(features)
        y.append(1)  # Is an ad
    
    # Generate negative examples (not ads)
    n_not_ads = n_samples - n_ads
    
    for _ in range(n_not_ads):
        # Regular content typically has:
        # - No ad keywords (mostly)
        # - Not iframes (mostly)
        # - Varied dimensions
        # - Different tag types
        
        # Some false positives (elements with "ad" in name but not ads)
        has_keyword = random.random() < 0.15  # 15% might have keywords (header, adapter, etc.)
        is_iframe = random.random() < 0.05    # 5% are iframes (videos, embeds)
        
        # Content dimensions (more varied)
        content_types = random.choice([
            'header', 'article', 'sidebar', 'footer', 'image', 'video', 'nav'
        ])
        
        if content_types == 'header':
            width = random.randint(800, 1920)
            height = random.randint(60, 150)
        elif content_types == 'article':
            width = random.randint(600, 900)
            height = random.randint(400, 2000)
        elif content_types == 'sidebar':
            width = random.randint(200, 350)
            height = random.randint(300, 1200)
        elif content_types == 'footer':
            width = random.randint(800, 1920)
            height = random.randint(100, 300)
        elif content_types == 'image':
            width = random.randint(100, 800)
            height = random.randint(100, 600)
        elif content_types == 'video':
            width = random.randint(400, 1280)
            height = random.randint(225, 720)
        else:  # nav
            width = random.randint(600, 1920)
            height = random.randint(40, 100)
        
        area = width * height
        
        # Keyword source (if present, likely in text or class, not ID)
        if has_keyword:
            keyword_source = random.choices([0, 1, 1, 2], [1, 2, 2, 1])[0]  # Favor text/class
        else:
            keyword_source = 0
        
        # Aspect ratio
        aspect_ratio = min(width / height, 10) if height > 0 else 0
        
        # Banner sized (less likely)
        is_banner = (
            (width >= 728 and height >= 90) or
            (width >= 300 and height >= 250) or
            (width >= 160 and height >= 600) or
            (width >= 320 and height >= 50)
        )
        
        # Large area
        is_large = area > 100000
        
        # Tag score (varied)
        tag_score = random.choices([0, 1, 2, 3], weights=[4, 3, 2, 1])[0]
        
        features = [
            1 if has_keyword else 0,
            1 if is_iframe else 0,
            width,
            height,
            area,
            keyword_source,
            aspect_ratio,
            1 if is_banner else 0,
            1 if is_large else 0,
            tag_score
        ]
        
        X.append(features)
        y.append(0)  # Not an ad
    
    # Shuffle the data
    combined = list(zip(X, y))
    random.shuffle(combined)
    X, y = zip(*combined)
    
    return np.array(X), np.array(y)

def train_model():
    """Train and save the Random Forest model"""
    
    print("=" * 60)
    print("Training Ad Detection Model")
    print("=" * 60)
    
    # Generate training data
    print("\n1. Generating synthetic training data...")
    X, y = generate_training_data(n_samples=5000)
    
    print(f"   Total samples: {len(X)}")
    print(f"   Ads: {sum(y)} ({sum(y)/len(y)*100:.1f}%)")
    print(f"   Not ads: {len(y) - sum(y)} ({(len(y)-sum(y))/len(y)*100:.1f}%)")
    
    # Split data
    print("\n2. Splitting data (80% train, 20% test)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Train model
    print("\n3. Training Random Forest Classifier...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=10,
        min_samples_leaf=5,
        random_state=42,
        n_jobs=-1
    )
    
    model.fit(X_train, y_train)
    print("   ✓ Training complete")
    
    # Cross-validation
    print("\n4. Performing cross-validation...")
    cv_scores = cross_val_score(model, X_train, y_train, cv=5)
    print(f"   CV Accuracy: {cv_scores.mean():.3f} (+/- {cv_scores.std():.3f})")
    
    # Evaluate on test set
    print("\n5. Evaluating on test set...")
    y_pred = model.predict(X_test)
    
    print("\n   Classification Report:")
    print("   " + "-" * 50)
    report = classification_report(y_test, y_pred, target_names=['Not Ad', 'Ad'])
    for line in report.split('\n'):
        print(f"   {line}")
    
    print("\n   Confusion Matrix:")
    print("   " + "-" * 50)
    cm = confusion_matrix(y_test, y_pred)
    print(f"   True Negatives:  {cm[0][0]:4d}  |  False Positives: {cm[0][1]:4d}")
    print(f"   False Negatives: {cm[1][0]:4d}  |  True Positives:  {cm[1][1]:4d}")
    
    # Feature importance
    print("\n6. Feature Importance:")
    print("   " + "-" * 50)
    feature_names = [
        'keyword_hit',
        'is_iframe',
        'width',
        'height',
        'area',
        'keyword_source',
        'aspect_ratio',
        'is_banner_sized',
        'is_large_area',
        'tag_score'
    ]
    
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    for i, idx in enumerate(indices[:5]):  # Top 5 features
        print(f"   {i+1}. {feature_names[idx]:20s} : {importances[idx]:.3f}")
    
    # Save model
    print("\n7. Saving model...")
    with open('ad_detector_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print("   ✓ Model saved to 'ad_detector_model.pkl'")
    
    print("\n" + "=" * 60)
    print("Training Complete!")
    print("=" * 60)
    print("\nYou can now run: python api_server.py")
    print()

if __name__ == '__main__':
    train_model()