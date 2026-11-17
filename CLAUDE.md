# tomato-timer — istruzioni per Claude

## Versione dell'app (CalVer + build)

Formato: `<anno>.<mese>.<build>` — es. `2026.11.20`. Mese **senza zero iniziale**
(`2026.8`, non `2026.08`): `package.json` vuole un semver valido.

`build` **non riparte mai**: è il numero di commit su `main` dall'inizio del
progetto. Si legge con:

```
git fetch origin main
git rev-list --count origin/main
```

Così la build cresce sempre — due versioni restano confrontabili anche a cavallo
di un mese — e da una versione si risale al punto esatto della storia da cui è
uscita.

**Regola: ogni modifica destinata a essere pubblicata aggiorna la versione**,
nello stesso commit. Vale per tutto quello che finisce in `dist/` (cioè `src/`):

- `build` → il conteggio dei commit su `main` (fatto su `main`, non sul proprio
  branch: i commit di lavoro non sono ancora pubblicati);
- anno e mese → quelli di oggi, anche se la build non cambia mese.

Se due PR sono aperte insieme partono dallo stesso numero: la seconda a essere
aggiornata ricalcola dopo il merge della prima. Non serve aggiornarla per
modifiche che non arrivano all'utente (documentazione, tooling).

La fonte di verità è una sola: il campo `version` di `package.json` (e quindi
di `package-lock.json`, che `npm` tiene allineato). `build.js` la scrive nel
footer di `dist/index.html` e si rifiuta di buildare se il formato non è quello
previsto. In `src/index.html` il footer dice `dev`: è la pagina non buildata.

## Deploy

Non c'è un deploy automatico: l'app online è quella che sta nella sotto-cartella
`tomato-timer/` del repo `filippoitaliano/filippoitaliano.github.io`, servita su
`garden.filippoitaliano.com/tomato-timer/`. Questo repo da solo non pubblica
niente.

**Regola: si pubblica solo una build di `main`, e la si pubblica intera.** Non
va online ogni commit: va online la versione che ci piace, quando ci piace. Ma
quello che va online deve venire da qui, buildato, mai ritoccato a mano:

1. dal branch che si vuole pubblicare: `npm ci && npm run build`;
2. copiare **tutto** il contenuto di `dist/` in `tomato-timer/` del repo del
   sito, sovrascrivendo — non solo i file che sembrano cambiati, perché
   `logic.js` è minificato e i nomi in `index.html` cambiano con lui;
3. nel repo del sito: commit `Deploy tomato-timer <versione>` e PR verso
   `master`. Lì è un cambiamento che va online, quindi segue le regole di
   quel repo (il suo `SITE_VERSION`);
4. si unisce **prima** la PR di questo repo su `main`, **poi** quella del
   sito. Così quello che è online corrisponde sempre a uno stato di `main`.

I file in `tomato-timer/` del repo del sito sono output, come `dist/`: un
errore lì si corregge in `src/` e si rifà il deploy, non si modifica la copia.

Per controllare che il deploy sia andato: il footer della pagina online deve
mostrare la stessa versione che c'è in `package.json` su `main`.
