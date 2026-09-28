# Villa Martius

Sito ufficiale di **Villa Martius** — location per matrimoni ed eventi a San Pier Niceto (Messina).

- **Sito**: [villamartius.it](https://www.villamartius.it) (attuale)
- **Instagram**: [@villa_martius_messina](https://instagram.com/villa_martius_messina)
- **Contatto**: vacanze@villamartius.it · 331 530 9082

## Struttura

Sito multi-pagina statico. Direzione estetica ispirata a Borgo Egnazia: travertino caldo, tipografia editoriale (Cormorant Garamond), spazi generosi, fotografia protagonista.

```
├── index.html          Home
├── la-villa.html       Storia e spazi della location
├── matrimoni.html      Servizio matrimoni + timeline del giorno
├── rito-civile.html    Sede equiparata a Casa Comunale (USP)
├── eventi.html         Eventi privati
├── galleria.html       Galleria fotografica
├── contatti.html       Contatti + form richiesta preventivo
└── assets/
    ├── css/style.css
    ├── js/main.js
    └── img/
```

## Deploy

### GitHub Pages

1. Push su `main`
2. Settings → Pages → Deploy from branch → `main` / `(root)`
3. Il sito sarà disponibile su `https://fladynance.github.io/villa-martius/`

Per un dominio personalizzato (es. `www.villamartius.it`):
- aggiungere un file `CNAME` con il dominio
- configurare i DNS A/CNAME come da [documentazione GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

### Netlify

Drop diretto della cartella su [app.netlify.com/drop](https://app.netlify.com/drop) — nessuna build necessaria.

## Form contatti

Il form in `contatti.html` mostra un feedback client-side ma non invia email. Da collegare a un servizio come:

- **Formspree** — endpoint gratuito, aggiungere `action="https://formspree.io/f/XXX"` al `<form>`
- **Netlify Forms** — aggiungere `data-netlify="true"` (solo su hosting Netlify)
- **Backend proprio** — endpoint POST personalizzato

## Font

Cormorant Garamond + Josefin Sans, caricati da Google Fonts.

## Licenza

© Villa Martius. Tutti i diritti riservati.
