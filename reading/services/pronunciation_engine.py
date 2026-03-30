import re
from difflib import SequenceMatcher
from .phonetic_analysis import detect_phonetic_errors


def normalize_text(text):
    """Remove punctuation and convert to lowercase."""
    text = re.sub(r"[^\w\s]", "", text.lower())
    text = " ".join(text.split())
    return text


def word_by_word_comparison(expected, spoken):
    """
    Compare expected text with spoken text word-by-word.
    Returns list of word results and accuracy score.
    """

    expected_norm = normalize_text(expected)
    spoken_norm = normalize_text(spoken)

    expected_words = expected_norm.split()
    spoken_words = spoken_norm.split()

    problem_words = []
    correct_count = 0
    total_words = len(expected_words)

    matcher = SequenceMatcher(None, expected_words, spoken_words)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():

        if tag == "equal":

            correct_count += (i2 - i1)

            for idx in range(i1, i2):
                problem_words.append({
                    "word": expected_words[idx],
                    "heard": expected_words[idx],
                    "position": idx,
                    "status": "correct"
                })

        elif tag == "replace":

            for idx in range(i1, i2):

                heard_word = (
                    spoken_words[j1 + (idx - i1)]
                    if (j1 + (idx - i1)) < len(spoken_words)
                    else "[missing]"
                )

                problem_words.append({
                    "word": expected_words[idx],
                    "heard": heard_word,
                    "position": idx,
                    "status": "mispronounced"
                })

        elif tag == "delete":

            for idx in range(i1, i2):
                problem_words.append({
                    "word": expected_words[idx],
                    "heard": "[missing]",
                    "position": idx,
                    "status": "missing"
                })

        elif tag == "insert":
            pass

    score = (correct_count / total_words) * 100 if total_words > 0 else 0

    return problem_words, round(score, 2)


def generate_feedback(problem_words, score):
    """Generate readable feedback for the student."""

    total_problems = len([w for w in problem_words if w["status"] != "correct"])

    if score >= 90:

        if total_problems == 0:
            return "🌟 Excellent! Perfect pronunciation. You read every word correctly!"

        return f"🌟 Great job! Just {total_problems} word(s) need a little practice."

    elif score >= 75:

        return (
            f"👍 Good effort! Focus on practicing these {total_problems} word(s). "
            "Try reading them slowly."
        )

    elif score >= 50:

        return (
            f"📝 Keep practicing! You missed {total_problems} word(s). "
            "Try listening to the audio and repeating."
        )

    else:

        return (
            "🎯 Let's start over. Listen to the audio carefully "
            "and try reading one sentence at a time."
        )