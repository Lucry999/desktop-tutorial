# ClipForge – lokale Video-KI

ClipForge kann die Videogenerierung komplett lokal über LTX Desktop ausführen.

## Voraussetzungen

- Windows 10/11
- NVIDIA-GPU mit mindestens 16 GB VRAM
- mindestens 16 GB RAM, 32 GB empfohlen
- viel freier Speicher für die LTX-Modelle
- LTX Desktop installiert und im lokalen Generierungsmodus

LTX Desktop stellt den lokalen Backend-Dienst auf `http://localhost:8000` bereit und unterstützt lokale Text-to-Video-Erzeugung. Bei NVIDIA-GPUs mit mindestens 16 GB VRAM ist lokale Generation vorgesehen.

## Start

1. LTX Desktop installieren.
2. LTX Desktop einmal starten und die lokalen Modelle fertig einrichten.
3. LTX Desktop geöffnet lassen.
4. Im ClipForge-Repository `start-clipforge-local.bat` starten.
5. Danach in ClipForge auf „Hochwertiges Video erstellen“ drücken.

Die Videorechenarbeit findet auf dem eigenen PC statt. Pro Video entstehen dabei keine Video-API-Kosten.

Die ClipForge-KI für Skript und Stimme läuft weiterhin über die vorhandene Mistral-Anbindung. Diese kann deren kostenloses Nutzungskontingent verbrauchen.
