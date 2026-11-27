The workbench
=============

The window
----------

The bar holds the menus, the workspace (a folder or a hub, its menu under the chevron), **Check**,
**Simulate**, the runtimes key (omc's state) and the Panels key; in a Paperboat window the
window's own keys end it. Below it, three cards: **Files** and **Library** at the left (:kbd:`Ctrl B`),
the model in the middle with the **Console** under it (:kbd:`Ctrl J`), the source and **Simulate** at
the right (:kbd:`Ctrl Alt B`). Each card hides to a slim bar. The tab above the model names its file.
Without a workspace the **Start** page takes the middle.

Files and Library
-----------------

The left card switches between **Files**, the workspace as packages and classes
(``package.order`` included), and **Library**, the package tree over the chosen package's components. Opening a ``.mo`` adds a tab above the stage; a model outside a package needs no package
at all, and a class inside a package is opened with its package loaded first.

Open and save
-------------

The File menu is the same in every Paperboat app: New model · Open file… (:kbd:`Ctrl O`) · Open folder…
(:kbd:`Ctrl Shift O`) · Open recent · Connect to a hub… · Save (:kbd:`Ctrl S`) · Save as…
(:kbd:`Ctrl Shift S`) · Close file (:kbd:`Ctrl W`) · Close folder · Settings… (:kbd:`Ctrl ,`).

**The hub decides the picker.** Outside a hub, Open file… asks: a local file (your system's file
dialog) or Connect to a hub…; without Malachite it goes straight to the local file. Inside a hub, Open
and Save as are Articula's own picker over the hub: only the ``.mo`` files and the folders holding them
(**All files** shows the rest), with when each changed and its size. A model from outside the workspace
switches the workspace to its folder, or to its hub; the models of the old one close. Save as writes
the model to the new file and goes on with it there; a name that is taken asks first (the hub's picker
turns Save into **Replace**, the system's dialog asks in its own words).

The workspace menu (the folder or hub in the bar) opens another folder, connects to a hub, shows the
folder in your file manager, and closes it (back to Start). In a hub it switches hubs, makes a **New
hub…**, opens the hub in Malachite, or leaves it: **Use a local folder instead…** or **Close hub**.
Closing a model, a folder or a hub with unsaved changes asks first: Save, Don't save, or Cancel.
Inside a hub no Git shows; Malachite keeps the history.

Open recent, and the Start page, list the folders and hubs every Paperboat app opened and the models
Articula opened, newest first (``recent.json`` in Paperboat's folder, ``~/.local/share/paperboat``).

In a browser the page gets no real paths: Open folder… and the local file take a typed path, Save as…
downloads the model, and a ``.mo`` dropped on the Start page is copied into Articula's own folder. In a
Paperboat window (``paperboat app open articula``) they are your system's dialogs.

Model › New class… (:kbd:`Ctrl Shift N`) opens the New Class sheet: name, kind, package, an optional
base class and a live skeleton. It writes the ``.mo`` and appends ``package.order`` when the class
lands in a package.

The stage
---------

The stage shows the model as a **diagram** (the canvas), as **text** (its ``.mo``) or, for a
``Modelica.Mechanics.MultiBody`` model that has been simulated, in **3d**: its shapes played back
against the run's time. Try :kbd:`Ctrl K`, **Open example: 05 Double pendulum**.

Checking a model
----------------

**Model › Check** runs ``checkModel`` and shows its messages as cards in the Console's **Messages**
tab; **Show the flat model** opens ``instantiateModel`` in the source card. The Console's **Log** tab
streams omc's own log as it works.

Simulating
----------

**Simulate** (:kbd:`Ctrl R`) runs the model in omc. Its setup is one row: the stop time and the
solver (method, tolerance, intervals, start; kept per model). A top-level input gets a stimulus
(constant, step, ramp, sine). The **variables browser** lists every result variable grouped by its
component, with its final value, and a filter; a check plots it, and the plot keeps the checked
variables per model. **Cancel** stops the build or the run.
