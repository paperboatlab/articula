Settings
========

The text editor's settings live in the user config file ``articula.toml``:
``~/.config/paperboat/`` (``$XDG_CONFIG_HOME``) on Linux and macOS, ``%APPDATA%\paperboat\`` on
Windows. The first run writes it with every key commented. The theme (Light, Dark, System) is the one
Paperboat setting every app shares: it lives in ``settings.json`` in Paperboat's folder
(``$PAPERBOAT_HOME``, else ``~/.local/share/paperboat``), every app starts in it, and a change in one is
written there. File › Settings… (:kbd:`Ctrl ,`) opens the text editor's settings in the model's Text view.
