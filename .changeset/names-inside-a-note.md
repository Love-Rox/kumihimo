---
'kumihimo-vscode': minor
---

Colour and suggestions inside a fenced block.

A ` ```kumihimo ` block in a `.md` file was plain grey text with no suggestions. The
completions were bound to the `kumihimo` language id, and a fenced block is a diagram VS Code
calls Markdown — so the names were offered while writing a diagram in a file and withheld
while writing the same diagram in a note about it.

- An injection grammar colours the block with the same grammar a `.khm` file gets. ` ```khm `
  too.
- The completions are registered for Markdown as well, and answer **only inside a kumihimo
  fence**. Counted from the top of the file rather than searched backwards, because a fence
  only means anything in sequence: ` ```khm ` inside a ` ```md ` example is a line of prose,
  and the only way to know is to have read what came before it.

Six checks: the names appear inside the fence, under both spellings, and nothing at all
appears in the prose, in another language's fence, or after the block closes. A seventh
asserts the _selector_ names both languages — calling the provider directly proves it
answers, and says nothing about whether VS Code ever asks, which was the whole fault.
