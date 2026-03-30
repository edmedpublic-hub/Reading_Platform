# reading/services/phonetic_analysis.py

"""
Phonetic error detection for pronunciation attempts.

Detects common pronunciation substitutions such as:
TH → T
R → L
V → W
B ↔ P
"""

PHONETIC_PATTERNS = [
    {
        "name": "TH sound",
        "expected": ["th"],
        "common_substitutions": ["t", "d"],
    },
    {
        "name": "R/L confusion",
        "expected": ["r"],
        "common_substitutions": ["l"],
    },
    {
        "name": "V/W confusion",
        "expected": ["v"],
        "common_substitutions": ["w"],
    },
    {
        "name": "B/P confusion",
        "expected": ["b"],
        "common_substitutions": ["p"],
    },
]


def detect_phonetic_errors(problem_words):
    """
    Analyze mispronounced words and detect phonetic patterns.
    """

    phonetic_errors = {}

    for entry in problem_words:

        expected = entry.get("word", "")
        heard = entry.get("heard", "")

        for rule in PHONETIC_PATTERNS:

            for expected_sound in rule["expected"]:

                if expected_sound in expected:

                    for sub in rule["common_substitutions"]:

                        if sub in heard and sub != expected_sound:

                            name = rule["name"]

                            phonetic_errors[name] = phonetic_errors.get(name, 0) + 1

    return phonetic_errors