# dnd-obs-tools

## D&D Beyond HP Bars

Shared HP bar styling and logic live in:

- `dndbeyond/hp-bars/hp-bars.css`
- `dndbeyond/hp-bars/hp-bars.js`

Each campaign can have its own small HTML file that loads those shared files and calls:

```html
<script>
  renderDndBeyondHpBars({
    elementId: "app",
    characterIds: [
      "141139271",
      "141138928"
    ]
  });
</script>
```

You can also pass `refreshMs` to change the polling interval, or set `refreshMs: false` to render once.
