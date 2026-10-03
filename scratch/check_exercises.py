import re

content = open('static/js/exercise_library.js', encoding='utf-8').read()
block = content.split('const EXERCISES = [')[1].split('];')[0]
keys = re.findall(r'key:\s*"([^"]+)"', block)

print(f"Total Exercise Count: {len(keys)}")
for i, k in enumerate(keys, 1):
    print(f"  {i}. {k}")

assert len(keys) == 10, f"Expected 10 exercises, found {len(keys)}"
print("VERIFICATION SUCCESS: EXACTLY 10 EXERCISES CONFIGURED!")
