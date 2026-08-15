## SMASHIO component library — read this before building

These are the real React Native components from the SMASHIO app
(`ui/components/*.tsx`), imported live from their source — not
reimplementations. **Read this before styling anything with them.**

### Styling: unstyled by design in this sync — do not trust the preview cards for color/spacing

Every component styles itself via `nativewind` (Tailwind classes on a
`className` prop, e.g. `className="px-4 py-3 rounded-2xl bg-brand-600"`).
nativewind applies those classes through a **compile-time babel plugin** the
app's real Metro build runs — this sync's bundle does not run that plugin,
so every preview card renders the component's real structure and props with
**no visual styling applied at all** (default RN colors/spacing, no fonts,
no rounding, no shadows). This is a known, deliberate gap for this sync pass
— see `.design-sync/NOTES.md` — not a bug in a specific component.

**What this means for building with these components**: treat each
component purely as a structural/prop reference (what it renders, what data
it takes, how it composes) — never copy visual values (color, spacing,
radius) from a rendered card. The real Tailwind classes live in each
component's source (`<Name>.jsx` in this bundle is a one-line re-export
stub; read the class names via each component's `.prompt.md`/`.d.ts` for
props, and treat color/spacing as unknown rather than guessing from render).
When a design needs actual color/spacing values, ask rather than infer them
from these cards.

### Composing components

No top-level provider wrap is required to mount a component — there's no
`ThemeProvider`/`ContextProvider` in this library. Some components read live
app state internally (auth session, react-query cache, Supabase client) and
will show their loading/empty/fallback state rather than real data outside
the real app — that's expected, not broken.

```jsx
import { Button, Chip, GameCard } from 'ui';

function Example() {
  return (
    <>
      <GameCard /* real props per GameCard.d.ts */ />
      <Chip label="Intermediate" />
      <Button label="Join game" variant="primary" onPress={() => {}} />
    </>
  );
}
```

### Where the truth lives

- Component source + real Tailwind classes: `ui/components/<Name>.tsx`
- Design tokens (colors, gradients): `ui/lib/theme.ts`
- Tailwind config (spacing/color scale, if extended): `ui/tailwind.config.js`
