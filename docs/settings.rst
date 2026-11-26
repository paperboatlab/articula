Settings
========

File › Settings… (:kbd:`Ctrl ,`) opens one window, the same in every Paperboat app, with its pages on
the left. A change applies at once; there is no Save.

- **General**: the theme, Light, Dark or System (follows your system). It is the one setting every
  Paperboat app shares: it lives in ``settings.json`` in Paperboat's folder (``$PAPERBOAT_HOME``, else
  ``~/.local/share/paperboat``), every app starts in it, and a change in one is written there. View ›
  Theme picks it too.
- **Articula**: OpenModelica (omc's version and how it runs; **Libraries…**, the workspace's Modelica
  libraries), Simulation (**Solver settings…**, kept per model) and Export (**Export station…**).
- **Editor**: the text editor's look (theme, font, size, line height) and typing (tab size, wrap lines,
  autocomplete, close brackets, lint). They live in the user config file ``articula.toml``:
  ``~/.config/paperboat/`` (``$XDG_CONFIG_HOME``) on Linux and macOS, ``%APPDATA%\paperboat\`` on
  Windows. The first run writes it with every key commented.
- **Hub**, while Articula works in a hub: its name and folder, **Switch hub…** and **Close hub**. The
  hub's own settings (its author, history, what it leaves out) are set in Malachite.
- **Shortcuts**: every key of Articula's commands, by menu. Help › Keyboard shortcuts (:kbd:`Ctrl /`)
  opens Settings on this page.
