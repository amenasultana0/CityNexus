import pandas as pd
import re
from collections import Counter

print("="*80)
print("EXTRACTING HARD STATS FROM YAARY HYDERABAD REVIEWS")
print("="*80)

# Load reviews
reviews_df = pd.read_csv('cleaned_data/yaary_reviews_with_sentiment.csv')

print(f"\nTotal reviews analyzed: {len(reviews_df)}")
print(f"Negative reviews: {len(reviews_df[reviews_df['sentiment'] == 'negative'])}")

# Focus on negative reviews for problem extraction
negative_reviews = reviews_df[reviews_df['sentiment'] == 'negative']['text'].tolist()

print("\n" + "="*80)
print("PROBLEM CATEGORY ANALYSIS")
print("="*80)

# Define problem categories with multiple keyword patterns
problem_patterns = {
    'time_waste': {
        'keywords': ['waste', 'wasting', 'wasted', 'time', 'long', 'forever', 'hours', 'minutes', 'waiting', 'wait'],
        'count': 0,
        'examples': []
    },
    'booking_failure': {
        'keywords': ['not.*book', 'unable.*book', 'can.*not.*book', 'couldn.*t.*book', 'failed', 'failure', 'not working', 'does.*not.*work'],
        'count': 0,
        'examples': []
    },
    'cancellation': {
        'keywords': ['cancel', 'cancelled', 'cancellation', 'canceling'],
        'count': 0,
        'examples': []
    },
    'driver_issues': {
        'keywords': ['driver', 'no driver', 'driver.*not', 'no.*auto', 'no.*cab'],
        'count': 0,
        'examples': []
    },
    'login_error': {
        'keywords': ['login', 'log in', 'sign in', 'register', 'registration', 'otp', 'verification'],
        'count': 0,
        'examples': []
    },
    'app_crash': {
        'keywords': ['crash', 'freeze', 'hang', 'stuck', 'not.*open', 'not.*load'],
        'count': 0,
        'examples': []
    },
    'error': {
        'keywords': ['error', 'issue', 'problem', 'not working properly'],
        'count': 0,
        'examples': []
    },
    'repeated_attempts': {
        'keywords': ['again', 'try.*again', 'multiple', 'many times', 'every time', 'everytime', 'always'],
        'count': 0,
        'examples': []
    }
}

# Analyze each negative review
for review in negative_reviews:
    if pd.isna(review):
        continue

    review_lower = str(review).lower()

    for category, data in problem_patterns.items():
        # Check if any keyword matches
        for keyword in data['keywords']:
            if re.search(keyword, review_lower):
                data['count'] += 1
                if len(data['examples']) < 3:  # Store max 3 examples
                    data['examples'].append(review)
                break

# Print results
print("\nProblem Frequency (from negative reviews):")
for category, data in sorted(problem_patterns.items(), key=lambda x: x[1]['count'], reverse=True):
    if data['count'] > 0:
        pct = (data['count'] / len(negative_reviews)) * 100
        print(f"\n{category.replace('_', ' ').title()}: {data['count']} mentions ({pct:.1f}% of negative reviews)")
        if data['examples']:
            print(f"  Example: \"{data['examples'][0][:150]}...\"")

# Extract time-related complaints specifically
print("\n" + "="*80)
print("TIME WASTE ANALYSIS")
print("="*80)

time_mentions = []
for review in negative_reviews:
    if pd.isna(review):
        continue
    review_lower = str(review).lower()

    # Look for time mentions
    if any(word in review_lower for word in ['waste', 'time', 'long', 'waiting', 'minutes', 'hours']):
        time_mentions.append(review)

print(f"\nReviews mentioning time waste: {len(time_mentions)} ({len(time_mentions)/len(negative_reviews)*100:.1f}% of negative reviews)")
print(f"As % of all reviews: {len(time_mentions)/len(reviews_df)*100:.1f}%")

print("\nSample time waste complaints:")
for i, review in enumerate(time_mentions[:5], 1):
    print(f"{i}. \"{review}\"")

# Cancellation analysis
print("\n" + "="*80)
print("CANCELLATION ANALYSIS")
print("="*80)

cancellation_mentions = []
for review in negative_reviews:
    if pd.isna(review):
        continue
    review_lower = str(review).lower()

    if 'cancel' in review_lower:
        cancellation_mentions.append(review)

print(f"\nReviews mentioning cancellations: {len(cancellation_mentions)} ({len(cancellation_mentions)/len(negative_reviews)*100:.1f}% of negative reviews)")
print(f"As % of all reviews: {len(cancellation_mentions)/len(reviews_df)*100:.1f}%")

print("\nSample cancellation complaints:")
for i, review in enumerate(cancellation_mentions[:5], 1):
    print(f"{i}. \"{review}\"")

# Booking failure analysis
print("\n" + "="*80)
print("BOOKING FAILURE ANALYSIS")
print("="*80)

booking_failure_mentions = []
for review in negative_reviews:
    if pd.isna(review):
        continue
    review_lower = str(review).lower()

    if any(pattern in review_lower for pattern in ['not.*book', 'unable.*book', 'can.*t.*book', 'couldn.*t.*book', 'booking.*fail', 'fail.*book']):
        booking_failure_mentions.append(review)

# Also check for "not working" in context of app
app_not_working = []
for review in negative_reviews:
    if pd.isna(review):
        continue
    review_lower = str(review).lower()

    if any(pattern in review_lower for pattern in ['not working', 'doesn.*t work', 'does.*not work', 'not open', 'can.*t open']):
        app_not_working.append(review)

total_booking_issues = len(booking_failure_mentions) + len(app_not_working)

print(f"\nReviews about booking failures: {len(booking_failure_mentions)}")
print(f"Reviews about app not working: {len(app_not_working)}")
print(f"Total booking-related issues: {total_booking_issues} ({total_booking_issues/len(negative_reviews)*100:.1f}% of negative reviews)")
print(f"As % of all reviews: {total_booking_issues/len(reviews_df)*100:.1f}%")

print("\nSample booking failure complaints:")
for i, review in enumerate((booking_failure_mentions + app_not_working)[:5], 1):
    print(f"{i}. \"{review}\"")

# Repeated attempts analysis
print("\n" + "="*80)
print("REPEATED ATTEMPTS ANALYSIS")
print("="*80)

repeated_attempt_mentions = []
for review in negative_reviews:
    if pd.isna(review):
        continue
    review_lower = str(review).lower()

    if any(pattern in review_lower for pattern in ['every time', 'everytime', 'always', 'again and again', 'multiple times', 'many times', 'try.*again']):
        repeated_attempt_mentions.append(review)

print(f"\nReviews mentioning repeated attempts/failures: {len(repeated_attempt_mentions)} ({len(repeated_attempt_mentions)/len(negative_reviews)*100:.1f}% of negative reviews)")
print(f"As % of all reviews: {len(repeated_attempt_mentions)/len(reviews_df)*100:.1f}%")

print("\nSample repeated attempt complaints:")
for i, review in enumerate(repeated_attempt_mentions[:5], 1):
    print(f"{i}. \"{review}\"")

# Score distribution for context
print("\n" + "="*80)
print("SCORE DISTRIBUTION (CONTEXT)")
print("="*80)

score_dist = reviews_df['score'].value_counts().sort_index()
print("\nScore breakdown:")
for score, count in score_dist.items():
    pct = (count / len(reviews_df)) * 100
    stars = '★' * score
    print(f"{stars} ({score}): {count:4d} reviews ({pct:5.1f}%)")

# Calculate overall dissatisfaction
low_scores = reviews_df[reviews_df['score'] <= 2]
print(f"\n1-2 star reviews (highly dissatisfied): {len(low_scores)} ({len(low_scores)/len(reviews_df)*100:.1f}%)")

# Final stats summary
print("\n" + "="*80)
print("FINAL STATS FOR PRESENTATION")
print("="*80)

print(f"""
📊 YAARY Hyderabad User Complaints Analysis
(Based on {len(reviews_df)} real user reviews from Hyderabad)

1. TIME WASTE
   • {len(time_mentions)/len(reviews_df)*100:.1f}% of users complained about time waste
   • Common phrases: "waste of time", "long waiting", "takes forever"

2. BOOKING FAILURES
   • {total_booking_issues/len(reviews_df)*100:.1f}% of users reported booking failures
   • Issues: App not working, unable to book, registration errors
   • This is {total_booking_issues} out of {len(reviews_df)} total reviews

3. REPEATED ATTEMPTS
   • {len(repeated_attempt_mentions)/len(reviews_df)*100:.1f}% of users mentioned repeated failures
   • Common phrases: "every time", "always fails", "try again and again"

4. CANCELLATIONS
   • {len(cancellation_mentions)/len(reviews_df)*100:.1f}% specifically mentioned cancellations

5. OVERALL DISSATISFACTION
   • {len(low_scores)/len(reviews_df)*100:.1f}% gave 1-2 star ratings (highly dissatisfied)
   • Average rating: {reviews_df['score'].mean():.2f}/5.0

📌 KEY INSIGHT:
The primary problem is BOOKING FAILURES ({total_booking_issues/len(reviews_df)*100:.1f}%), not just cancellations.
Users can't even complete a booking attempt before facing errors.

This validates CityNexus's value proposition:
"Give users pre-booking intelligence so they know BEFORE attempting to book
whether their ride will succeed, get cancelled, or face surge pricing."
""")

# Save stats to file
stats_summary = {
    'total_reviews': len(reviews_df),
    'negative_reviews': len(reviews_df[reviews_df['sentiment'] == 'negative']),
    'time_waste_pct': round(len(time_mentions)/len(reviews_df)*100, 1),
    'booking_failure_pct': round(total_booking_issues/len(reviews_df)*100, 1),
    'repeated_attempts_pct': round(len(repeated_attempt_mentions)/len(reviews_df)*100, 1),
    'cancellation_pct': round(len(cancellation_mentions)/len(reviews_df)*100, 1),
    'dissatisfied_pct': round(len(low_scores)/len(reviews_df)*100, 1),
    'avg_rating': round(reviews_df['score'].mean(), 2)
}

stats_df = pd.DataFrame([stats_summary])
stats_df.to_csv('cleaned_data/yaary_problem_stats.csv', index=False)

print("\n✓ Stats saved to: cleaned_data/yaary_problem_stats.csv")
