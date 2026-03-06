import pandas as pd
from collections import Counter
import re

print("="*80)
print("YAARY HYDERABAD REVIEWS - SENTIMENT & PAIN POINT ANALYSIS")
print("="*80)

# Load reviews
reviews_df = pd.read_csv('cleaned_data/yaary_reviews_clean.csv')
print(f"\nTotal reviews: {len(reviews_df)}")

# Sentiment classification based on score
def classify_sentiment(score):
    if score <= 2:
        return 'negative'
    elif score == 3:
        return 'neutral'
    else:
        return 'positive'

reviews_df['sentiment'] = reviews_df['score'].apply(classify_sentiment)

# Sentiment distribution
print("\n" + "-"*80)
print("SENTIMENT DISTRIBUTION")
print("-"*80)
sentiment_counts = reviews_df['sentiment'].value_counts()
print(sentiment_counts)
print(f"\nPercentages:")
for sentiment, count in sentiment_counts.items():
    pct = (count / len(reviews_df)) * 100
    print(f"  {sentiment.capitalize()}: {pct:.1f}%")

# Score distribution
print("\n" + "-"*80)
print("SCORE DISTRIBUTION")
print("-"*80)
score_counts = reviews_df['score'].value_counts().sort_index()
for score, count in score_counts.items():
    pct = (count / len(reviews_df)) * 100
    stars = '★' * score
    print(f"  {stars} ({score}): {count:4d} reviews ({pct:5.1f}%)")

# Pain point analysis - extract common complaint keywords
print("\n" + "-"*80)
print("TOP PAIN POINTS (from negative reviews)")
print("-"*80)

negative_reviews = reviews_df[reviews_df['sentiment'] == 'negative']
print(f"\nAnalyzing {len(negative_reviews)} negative reviews...")

# Common pain point keywords
pain_keywords = {
    'driver': ['driver', 'drivers'],
    'cancellation': ['cancel', 'cancelled', 'cancellation', 'canceling'],
    'waiting': ['wait', 'waiting', 'waited'],
    'app_crash': ['crash', 'crashes', 'crashed', 'freezes', 'frozen'],
    'login_error': ['login', 'log in', 'sign in'],
    'payment': ['payment', 'pay', 'charged', 'refund'],
    'customer_service': ['customer care', 'customer service', 'support'],
    'otp': ['otp', 'verification code'],
    'unknown_error': ['unknown error', 'error'],
    'slow': ['slow', 'loading', 'takes forever'],
    'booking_fail': ['booking', 'book'],
    'auto_assignment': ['auto', 'assignment'],
}

pain_point_counts = {key: 0 for key in pain_keywords.keys()}

for text in negative_reviews['text']:
    if pd.isna(text):
        continue
    text_lower = str(text).lower()
    for pain_point, keywords in pain_keywords.items():
        for keyword in keywords:
            if keyword in text_lower:
                pain_point_counts[pain_point] += 1
                break

# Sort by frequency
sorted_pain_points = sorted(pain_point_counts.items(), key=lambda x: x[1], reverse=True)

print("\nTop 10 complaint themes:")
for i, (pain_point, count) in enumerate(sorted_pain_points[:10], 1):
    pct = (count / len(negative_reviews)) * 100
    print(f"  {i:2d}. {pain_point.replace('_', ' ').title():20s}: {count:4d} mentions ({pct:5.1f}% of negative reviews)")

# Sample negative reviews
print("\n" + "-"*80)
print("SAMPLE NEGATIVE REVIEWS (Score 1)")
print("-"*80)
sample_negative = reviews_df[reviews_df['score'] == 1].head(5)
for idx, row in sample_negative.iterrows():
    text = row['text'][:200] + "..." if len(str(row['text'])) > 200 else row['text']
    print(f"\n• {text}")

# Sample positive reviews
print("\n" + "-"*80)
print("SAMPLE POSITIVE REVIEWS (Score 5)")
print("-"*80)
sample_positive = reviews_df[reviews_df['score'] == 5].head(5)
for idx, row in sample_positive.iterrows():
    text = row['text'][:200] + "..." if len(str(row['text'])) > 200 else row['text']
    print(f"\n• {text}")

# Save analysis summary
summary = {
    'total_reviews': len(reviews_df),
    'negative_count': len(reviews_df[reviews_df['sentiment'] == 'negative']),
    'neutral_count': len(reviews_df[reviews_df['sentiment'] == 'neutral']),
    'positive_count': len(reviews_df[reviews_df['sentiment'] == 'positive']),
    'negative_pct': (len(reviews_df[reviews_df['sentiment'] == 'negative']) / len(reviews_df)) * 100,
    'neutral_pct': (len(reviews_df[reviews_df['sentiment'] == 'neutral']) / len(reviews_df)) * 100,
    'positive_pct': (len(reviews_df[reviews_df['sentiment'] == 'positive']) / len(reviews_df)) * 100,
    'avg_score': reviews_df['score'].mean(),
}

summary_df = pd.DataFrame([summary])
summary_df.to_csv('cleaned_data/yaary_sentiment_summary.csv', index=False)

# Save full reviews with sentiment
reviews_df.to_csv('cleaned_data/yaary_reviews_with_sentiment.csv', index=False)

print("\n" + "="*80)
print("ANALYSIS COMPLETE")
print("="*80)
print(f"\nAverage score: {summary['avg_score']:.2f} / 5.0")
print(f"\n✓ Saved sentiment summary to: cleaned_data/yaary_sentiment_summary.csv")
print(f"✓ Saved reviews with sentiment to: cleaned_data/yaary_reviews_with_sentiment.csv")

print("\n" + "="*80)
print("KEY INSIGHTS FOR CITYNEXUS PRESENTATION")
print("="*80)
print("\n1. YAARY has severe user satisfaction issues:")
print(f"   - {summary['negative_pct']:.1f}% negative reviews")
print(f"   - Average rating: {summary['avg_score']:.2f}/5.0")
print("\n2. Top 3 user pain points:")
for i, (pain_point, count) in enumerate(sorted_pain_points[:3], 1):
    print(f"   {i}. {pain_point.replace('_', ' ').title()}")
print("\n3. This validates CityNexus value proposition:")
print("   - Users need better pre-booking intelligence")
print("   - Cancellation risk prediction directly addresses top complaint")
print("   - Surge forecasting helps reduce wait times")
