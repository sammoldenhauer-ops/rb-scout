import pathlib

# Path to the built JS file containing the data.
source_path = pathlib.Path(r"c:\Users\User\Desktop\rb-scout\dist\assets\index-BH2pbF1J.js")
text = source_path.read_text(encoding="utf-8", errors="replace")

start = text.find("be={")
if start == -1:
    raise SystemExit("Could not find 'be={' in built JS file")

# Find the matching closing brace for the object.
stack = []
end = None
for i, ch in enumerate(text[start:], start):
    if ch == "{":
        stack.append(i)
    elif ch == "}":
        stack.pop()
        if not stack:
            end = i
            break

if end is None:
    raise SystemExit("Could not find end of object starting at 'be={'")

obj = text[start:end+1]

out_path = pathlib.Path(r"c:\Users\User\Desktop\rb-scout\data\extractedPlayersBase.js")
out_path.write_text("export const EXTRACTED = " + obj + ";\n", encoding="utf-8")
print(f"Wrote {out_path} (length {len(obj)}).")
