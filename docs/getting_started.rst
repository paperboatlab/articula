Getting started
===============

Install and open it with the Paperboat CLI (or the Launcher's Apps page). Installing pulls the ``omc``
runtime too.

.. code-block:: sh

   paperboat app install articula
   paperboat app open articula [<folder>]      # http://127.0.0.1:59240
   paperboat app stop articula

The Modelica Standard Library is one of the workspace's packages, installed once per folder:

.. code-block:: sh

   paperboat package add omc Modelica --project <folder>

(or Model › Libraries… in Articula, or the Launcher's Runtimes › omc › Packages).

Your first model
----------------

- Open a ``.mo`` from **Files**, or File › New class… (:kbd:`Ctrl Shift N`).
- Drag parts from **Library** onto the diagram and wire their ports; the text follows every edit.
- The bar under the diagram counts equations and unknowns; **Check** (:kbd:`Ctrl Shift C`) asks omc.
- **Simulate** (:kbd:`Ctrl R`) runs the model; check variables in the browser to plot them.

Select a part and press :kbd:`F1` to read its class's documentation. :kbd:`Ctrl K` searches the
commands and the workspace's classes.

The workspace
-------------

Articula opens a folder (or a ``.mo``, and the folder holding it or its top package). Started without
one, it opens its own, ``~/Documents/paperboat/articula`` (``ARTICULA_WORKSPACE`` overrides it): the
first ``.mo`` in it, or a new ``Untitled.mo``. omc sees only that folder (and the build and library
folders paperboatd gives it), so models outside it can't be opened.
