"""
Test script for the Ad Detection API
Tests various ad and non-ad examples
"""

import requests
import json

API_URL = 'http://localhost:8000'

def test_health():
    """Test the health endpoint"""
    print("=" * 60)
    print("Testing /health endpoint...")
    print("=" * 60)
    
    try:
        response = requests.get(f'{API_URL}/health')
        data = response.json()
        print(f"Status: {data['status']}")
        print(f"Model loaded: {data['model_loaded']}")
        print("✓ Health check passed\n")
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}\n")
        return False

def test_predict():
    """Test the predict endpoint with sample data"""
    print("=" * 60)
    print("Testing /predict endpoint...")
    print("=" * 60)
    
    # Test cases
    test_cases = [
        {
            'name': 'Clear Ad (iframe with ad keywords)',
            'candidate': {
                'keyWordHit': True,
                'keyWordSource': 'id',
                'keyWordMatch': 'ad',
                'isIframe': True,
                'tag': 'IFRAME',
                'id': 'google-ad-1',
                'classList': 'advertisement',
                'width': 728,
                'height': 90,
                'area': 65520
            },
            'expected': 'ad'
        },
        {
            'name': 'Banner Ad (standard size with keywords)',
            'candidate': {
                'keyWordHit': True,
                'keyWordSource': 'class',
                'keyWordMatch': 'ad-banner',
                'isIframe': False,
                'tag': 'DIV',
                'id': '',
                'classList': 'ad-banner sidebar',
                'width': 300,
                'height': 250,
                'area': 75000
            },
            'expected': 'ad'
        },
        {
            'name': 'Sponsored Content',
            'candidate': {
                'keyWordHit': True,
                'keyWordSource': 'class',
                'keyWordMatch': 'sponsored',
                'isIframe': False,
                'tag': 'DIV',
                'id': 'promoted-content',
                'classList': 'sponsored-post card',
                'width': 600,
                'height': 400,
                'area': 240000
            },
            'expected': 'ad'
        },
        {
            'name': 'Regular Article (no ad indicators)',
            'candidate': {
                'keyWordHit': False,
                'keyWordSource': None,
                'keyWordMatch': None,
                'isIframe': False,
                'tag': 'ARTICLE',
                'id': 'main-content',
                'classList': 'article-body content',
                'width': 700,
                'height': 1200,
                'area': 840000
            },
            'expected': 'not ad'
        },
        {
            'name': 'Header (might have "ad" in "header")',
            'candidate': {
                'keyWordHit': False,
                'keyWordSource': None,
                'keyWordMatch': None,
                'isIframe': False,
                'tag': 'HEADER',
                'id': 'site-header',
                'classList': 'header navigation',
                'width': 1200,
                'height': 80,
                'area': 96000
            },
            'expected': 'not ad'
        },
        {
            'name': 'Video Embed (iframe but not ad)',
            'candidate': {
                'keyWordHit': False,
                'keyWordSource': None,
                'keyWordMatch': None,
                'isIframe': True,
                'tag': 'IFRAME',
                'id': 'youtube-player',
                'classList': 'video-embed',
                'width': 640,
                'height': 360,
                'area': 230400
            },
            'expected': 'not ad'
        },
    ]
    
    results = []
    
    for i, test in enumerate(test_cases):
        print(f"\nTest {i+1}: {test['name']}")
        print("-" * 60)
        
        payload = {
            'adCandidates': [test['candidate']]
        }
        
        try:
            response = requests.post(f'{API_URL}/predict', json=payload)
            data = response.json()
            
            prediction = data['predictions'][0]
            is_ad = prediction['isAd']
            confidence = prediction['confidence']
            selector = prediction['selector']
            
            # Determine if prediction matches expectation
            expected_is_ad = (test['expected'] == 'ad')
            correct = (is_ad == expected_is_ad)
            
            print(f"Expected: {test['expected']}")
            print(f"Predicted: {'ad' if is_ad else 'not ad'}")
            print(f"Confidence: {confidence}%")
            print(f"Selector: {selector}")
            print(f"Result: {'✓ CORRECT' if correct else '✗ INCORRECT'}")
            
            results.append({
                'test': test['name'],
                'correct': correct,
                'confidence': confidence
            })
            
        except Exception as e:
            print(f"✗ Test failed: {e}")
            results.append({
                'test': test['name'],
                'correct': False,
                'confidence': 0
            })
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    correct_count = sum(1 for r in results if r['correct'])
    total_count = len(results)
    accuracy = (correct_count / total_count * 100) if total_count > 0 else 0
    
    print(f"Passed: {correct_count}/{total_count} ({accuracy:.1f}%)")
    print()
    
    for result in results:
        status = "✓" if result['correct'] else "✗"
        print(f"{status} {result['test']}: {result['confidence']}% confidence")
    
    print()

def main():
    print("\n")
    print("=" * 60)
    print("AI Ad Detection API Test Suite")
    print("=" * 60)
    print()
    
    # Test health endpoint
    if not test_health():
        print("⚠️  Server is not running or model is not loaded!")
        print("   Please start the server: python api_server.py")
        return
    
    # Test predictions
    test_predict()
    
    print("=" * 60)
    print("Testing Complete!")
    print("=" * 60)
    print()

if __name__ == '__main__':
    main()