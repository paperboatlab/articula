Getting started
===============

Install and open it with the Paperboat CLI (or the Launcher's Apps page). Installing pulls the ``omc``
runtime too.

.. code-block:: sh

   paperboat app install articula
   paperboat app open articula [<folder>]      # http://127.0.0.1:30472
   paperboat app stop articula

The Modelica Standard Library is one of the workspace's packages, installed once per folder:

.. code-block:: sh

   paperboat package add omc Modelica --project <folder>

(or Model › Libraries… in Articula, or the Launcher's Runtimes › omc › Packages).

Your first model
----------------

- Open a ``.mo`` from **Files**, or Model › New class… (:kbd:`Ctrl Shift N`).
- Drag parts from **Library** onto the diagram and wire their ports; the text follows every edit.
- The bar under the diagram counts equations and unknowns; **Check** (:kbd:`Ctrl Shift C`) asks omc.
- **Simulate** (:kbd:`Ctrl R`) runs the model; check variables in the browser to plot them.

Select a part and press :kbd:`F1` to read its class's documentation. :kbd:`Ctrl K` searches the
commands and the workspace's classes.

The workspace
-------------

Articula works in a workspace: a folder on this computer, or a hub (Malachite's, when it is installed).
Started on a folder or a ``.mo`` it opens there (a ``.mo`` in the folder holding it or its top package);
started without one it shows the **Start** page: Open folder… (:kbd:`Ctrl K Ctrl O`), Open file…
(:kbd:`Ctrl O`), New model, Connect to a hub…, and what was opened recently. omc sees only the
workspace (and the build and library folders paperboatd gives it), so a model from outside switches the
workspace to its folder, or to its hub when it lies in one. A new model without a workspace goes to
Articula's own folder, ``~/Documents/paperboat/articula`` (``ARTICULA_WORKSPACE`` overrides it).
