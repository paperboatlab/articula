The workbench
=============

The window
----------

The bar holds the menus, the open model, **Check**, **Simulate**, the runtimes key (omc's state), the
Panels key and the theme. Below it, three cards: **Files** and **Library** at the left (:kbd:`Ctrl B`),
the model in the middle with the **Console** under it (:kbd:`Ctrl J`), the source and **Simulate** at
the right (:kbd:`Ctrl Alt B`). Each card hides to a slim bar.

Files and Library
-----------------

The left card switches between **Files**, the workspace as packages and classes
(``package.order`` included), and **Library**, the package tree over the chosen package's components. Opening a ``.mo`` adds a tab above the stage; a model outside a package needs no package
at all, and a class inside a package is opened with its package loaded first.

File › New class… opens the New Class sheet: name, kind, package, an optional
base class and a live skeleton. It writes the ``.mo`` and appends ``package.order`` when the class
lands in a package.

The stage
---------

The stage shows the model as a **diagram** (the canvas), as **text** (its ``.mo``) or, for a
``Modelica.Mechanics.MultiBody`` model that has been simulated, in **3d**: its shapes played back
against the run's time. Try ``bin/articula examples/multibody/DoublePendulum.mo``.

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
