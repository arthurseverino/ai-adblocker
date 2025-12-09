"""
AI Ad Detection API Server
Provides ML-based ad detection for the Chrome extension
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pickle
import os
from typing import List, Dict

app = Flask(__name__)
CORS(app)  # Allow requests from Chrome extension

# Chrome's Private Network Access (PNA) changes can block requests to localhost
# from extension/service-worker contexts unless the server responds to preflight
# with `Access-Control-Allow-Private-Network: true`. Add this header to all
# responses so the extension's background script can call the local backend.
@app.after_request
def add_private_network_header(response):
    response.headers['Access-Control-Allow-Private-Network'] = 'true'
    return response

# Load the trained model
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'ad_detector_model.pkl')
model = None

def load_model():
    """Load the trained model from disk"""
    global model
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        print(f"✓ Model loaded from {MODEL_PATH}")
    else:
        print(f"✗ Model not found at {MODEL_PATH}. Please train the model first.")
        
load_model()

def extract_features(candidate: Dict) -> np.ndarray:
    """
    Extract numerical features from a candidate element
    
    Features:
    1. keyWordHit (0/1)
    2. isIframe (0/1)
    3. width
    4. height
    5. area
    6. keyWordSource encoded (none=0, id=3, class=2, text=1)
    7. aspect_ratio (width/height, capped at 10)
    8. is_banner_sized (0/1) - typical banner dimensions
    9. is_large_area (0/1) - >100k pixels
    10. tag_score (iframe=3, div=2, img=1, other=0)
    """
    
    features = []
    
    # Binary features
    features.append(1 if candidate.get('keyWordHit') else 0)
    features.append(1 if candidate.get('isIframe') else 0)
    
    # Dimension features
    width = candidate.get('width', 0)
    height = candidate.get('height', 0)
    area = candidate.get('area', 0)
    
    features.append(width)
    features.append(height)
    features.append(area)
    
    # Keyword source importance (ID is strongest signal)
    source = candidate.get('keyWordSource', None)
    source_map = {'none': 0, 'text': 1, 'class': 2, 'id': 3}
    features.append(source_map.get(source, 0))
    
    # Aspect ratio (banner ads are often wide)
    aspect_ratio = width / height if height > 0 else 0
    features.append(min(aspect_ratio, 10))  # Cap at 10
    
    # Banner-sized detection (common ad dimensions)
    is_banner = (
        (width >= 728 and height >= 90) or  # Leaderboard
        (width >= 300 and height >= 250) or  # Medium rectangle
        (width >= 160 and height >= 600) or  # Wide skyscraper
        (width >= 320 and height >= 50)      # Mobile banner
    )
    features.append(1 if is_banner else 0)
    
    # Large area (ads are often sizable)
    features.append(1 if area > 100000 else 0)
    
    # Tag importance
    tag = candidate.get('tag', '').upper()
    tag_scores = {'IFRAME': 3, 'DIV': 2, 'IMG': 1, 'SECTION': 1, 'ASIDE': 1}
    features.append(tag_scores.get(tag, 0))
    
    return np.array(features)

def create_selector(candidate: Dict) -> str:
    """Create a CSS selector for the element"""
    elem_id = candidate.get('id', '').strip()
    class_list = candidate.get('classList', '').strip()
    
    if elem_id:
        return f"#{elem_id}"
    elif class_list:
        # Take first class for simplicity
        first_class = class_list.split()[0] if class_list else ''
        if first_class:
            return f".{first_class}"
    
    # Fallback to tag
    tag = candidate.get('tag', 'div').lower()
    return tag

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None
    })

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    """
    Predict which elements are ads
    
    Expected input:
    {
        "adCandidates": [
            {
                "keyWordHit": true,
                "keyWordSource": "id",
                "keyWordMatch": "ad",
                "isIframe": false,
                "tag": "DIV",
                "id": "ad-container",
                "classList": "ad-banner",
                "width": 300,
                "height": 250,
                "area": 75000
            },
            ...
        ]
    }
    
    Returns:
    {
        "predictions": [
            {
                "index": 0,
                "isAd": true,
                "confidence": 85,
                "selector": "#ad-container"
            },
            ...
        ]
    }
    """
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    if model is None:
        error_msg = 'Model not loaded. Please train the model first using: python train_model.py'
        print(f"[ERROR] {error_msg}")
        return jsonify({
            'error': error_msg
        }), 500
    
    try:
        import time
        start_time = time.time()
        
        data = request.get_json()
        if not data or 'adCandidates' not in data:
            return jsonify({
                'error': 'Missing adCandidates in request body'
            }), 400
        
        candidates = data['adCandidates']
        print(f"[/predict] Processing {len(candidates)} candidates...")
        
        if not candidates:
            return jsonify({'predictions': []})
        
        # Extract features for all candidates
        feature_start = time.time()

        features_list = []
        for candidate in candidates:
            features = extract_features(candidate)
            features_list.append(features)
        
        feature_elapsed = (time.time() - feature_start) * 1000

        X = np.array(features_list)

        print(f"[/predict] Feature extraction took {feature_elapsed:.2f}ms")
        
        # Get predictions and probabilities
        model_start = time.time()

        predictions = model.predict(X)
        probabilities = model.predict_proba(X)

        model_elapsed = (time.time() - model_start) * 1000
        print(f"[/predict] Model inference took {model_elapsed:.2f}ms")
        
        # Build response
        response_start = time.time()

        results = []
        for idx, (pred, proba) in enumerate(zip(predictions, probabilities)):
            # proba[1] is the probability of being an ad (class 1)
            confidence = int(proba[1] * 100)
            is_ad = confidence >= 80  # Threshold at 80%
            
            results.append({
                'index': idx,
                'isAd': bool(is_ad),
                'confidence': confidence,
                'selector': create_selector(candidates[idx])
            })
        
        response_elapsed = (time.time() - response_start) * 1000
        total_elapsed = (time.time() - start_time) * 1000
        
        ads_count = sum(1 for r in results if r['isAd'])
        print(f"[/predict] Response building took {response_elapsed:.2f}ms")
        print(f"[/predict] ✓ TOTAL: {total_elapsed:.2f}ms | Detected {ads_count}/{len(candidates)} ads")
        
        return jsonify({
            'predictions': results,
            'total_scanned': len(candidates),
            'ads_detected': ads_count
        })
        
    except Exception as e:
        import traceback
        print(f"[ERROR] Prediction failed: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': f'Prediction failed: {str(e)}'
        }), 500

@app.route('/reload-model', methods=['POST'])
def reload_model():
    """Reload the model from disk"""
    load_model()
    return jsonify({
        'success': model is not None,
        'message': 'Model reloaded' if model else 'Model not found'
    })

if __name__ == '__main__':
    print("=" * 60)
    print("AI Ad Detection API Server")
    print("=" * 60)
    
    if model is None:
        print("\n⚠️  WARNING: No trained model found!")
        print("   Please run: python train_model.py")
        print()
    
    print("Starting server on http://localhost:5001")
    print("Endpoints:")
    print("  POST /predict       - Predict ads from candidates")
    print("  GET  /health        - Health check")
    print("  POST /reload-model  - Reload model from disk")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5001, debug=True)