Export and import
=================

**Model ▸ Export…** (:kbd:`Ctrl E`) opens the export and import dialog on the kind used last; **Model ▸
Export as** and **Model ▸ Import** open it on one kind. The kinds are down the left, grouped; the right
holds the chosen kind's options, **Where** it goes, and **In a terminal**: the same export as an ``articula export`` command, with Copy. A kind that
can't be chosen now stays in the list, greyed, and says why.

Export
------

**Where** takes a path relative to the workspace (the folder or hub open in Articula); the defaults below
are such paths. In a **hub** an export stays inside it (**Change…** opens the hub's picker), so the hub
keeps it and its history. In a **folder** it may go anywhere on this computer: an absolute path or
``~/…``, or **Change…**, the system's save dialog in a Paperboat window. A file already there is replaced
(in a hub, its earlier version stays in the hub's history).

.. list-table::
   :header-rows: 1
   :widths: 18 18 64

   * - Kind
     - Goes to
     - What it is
   * - Station
     - ``stations/<model>.pst``
     - The model as it is, for Simplicial (see below). **Path**: Auto takes equations when the model has
       no events, else an FMU; **FMU solver**: CVODE or Euler inside the FMU.
   * - Linear station
     - ``stations/<model>-linear.pst``
     - The model linearised at an **operating point** (parameters changed for the linearisation only,
       ``alpha0 = 0``; the inputs at 0; a time, 0 for the start), as a station with one block:
       ẋ = A x + B u, y = C x + D u. Its inputs and outputs are the model's, each counted from its value at
       the operating point, and x starts at 0. It is built on the equations path, so it needs no FMU and
       no omc to run.
   * - Linear model
     - ``<model folder>/out/<model>-lin.jl``
     - A, B, C, D at the operating point, written by omc's ``linearize`` as Julia (a function returning the
       matrices and the names of the states, inputs and outputs), Python, MATLAB or Modelica. Julix
       ``include``\ s the Julia one and designs a controller from it.
   * - FMU
     - ``<model folder>/out/<model>.fmu``
     - FMI 2.0 or 3.0, co-simulation (with CVODE or Euler inside) or model exchange, built by omc's
       ``buildModelFMU`` for this computer. In Julia, FMI.jl loads it.
   * - Flat model
     - ``<model folder>/out/<model>.flat.mo``
     - omc's ``instantiateModel``: every equation in one class.
   * - Equations
     - ``<model folder>/out/<model>.dae.xml``
     - omc's ``dumpXMLDAE`` at a **stage**: flat, optimised, or the back end (after index reduction and
       tearing, with how each equation is solved).
   * - Results
     - ``runs/<date>_<model>/run.csv``
     - The last simulation as CSV: time, then each variable it returned.

From a terminal
~~~~~~~~~~~~~~~

The dialog's command runs the same export without the app, into the current folder::

   articula export model/Furuta.mo --model Furuta.Pendulum --as linear --set alpha0=0 --lang julia --out design/out/pendulum-lin.jl

``--as`` is ``station``, ``linear-station``, ``linear``, ``fmu``, ``flat`` or ``equations``; ``--set
a=1,b=2`` and ``--at <s>`` the operating point; ``--lang``, ``--fmi``, ``--type cs|me``, ``--solver
cvode|euler``, ``--stage flat|optimiser|backEnd`` and ``--path auto|ode|fmu`` the options above. Without
``--out`` it writes ``<model>`` with the kind's extension. ``articula help`` lists them.

Import
------

An import changes the open model, so **Edit ▸ Undo** takes it back, and nothing is saved until you save.
It reads a file in the workspace.

.. list-table::
   :header-rows: 1
   :widths: 18 82

   * - Kind
     - What it does
   * - Parameters
     - Sets a component's modifiers, or the model's own parameters, from a ``.toml`` or ``.json`` (an
       identification's results). The preview lists each parameter the file has, its value now and from
       the file; the ones that differ are set.
   * - Data table
     - Adds a ``CombiTimeTable`` that plays a ``.csv`` back: time is the first column, the outputs the
       columns chosen, held, linear or smooth between rows. Its file is written as
       ``Modelica.Utilities.Files.loadResource("modelica://<Model>/…")``, a path from the model's own
       folder, so the model runs wherever omc does and the ``.mo`` stays portable.
   * - Linear model
     - Adds a block from a ``.toml``'s matrices: ``K`` alone becomes a ``MatrixGain`` with u = −K x (a state
       feedback designed in Julix), ``A``, ``B``, ``C`` and ``D`` a ``StateSpace``.
   * - FMU
     - Not yet (`articula#40 <https://github.com/paperboatlab/articula/issues/40>`_).

The dock: a station for Simplicial
----------------------------------

The dock has the station's two keys: **Export station…** opens this dialog on Station (the ``.pst`` goes
into the workspace, as any export), and **Start in Simplicial** builds the station, starts it on a free
port and opens Simplicial on it, on the station's starter flow (**Open** opens it again, **Restart**
rebuilds, **Stop** ends it), writing no file of yours. Both generate into ``<tmp>/articula_<model>`` and
run Simplicial's ``paperboat pack`` or ``paperboat run`` there, through ``$PAPERBOAT_BIN`` or
``paperboat`` on PATH, so Simplicial must be installed (``paperboat app install simplicial``). The first
build of a station compiles it, which takes a minute or so; a model with MultiBody shapes builds an FMU
first, which takes longer. Linear station packs the same way.

A model with MultiBody shapes (bodies, joints) draws them on the station's 3D view in
Simplicial, as Articula's own 3D view does, and they move with the run. A model without shapes has no
3D scene.

In the station, the model's parameters (a ``parameter Real C1F``) are props of its Station object,
edited on the Station page; the Flow block carries only the inputs and outputs. See the
`Simplicial manual <https://paperboatlab.org/apps/simplicial/>`_ for running it.
