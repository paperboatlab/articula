Export a Paperboat station
==========================

The dock exports the model as a Simplicial station: **Download .pst** packs a ``<model>.pst``, and
**Start in Simplicial** builds the station, starts it on a free port and opens Simplicial on it, on the
station's starter flow (**Open** opens it again, **Restart** rebuilds, **Stop** ends it). Both generate into
``<tmp>/articula_<model>`` and run Simplicial's ``paperboat pack`` or ``paperboat run`` there, through
``$PAPERBOAT_BIN`` or ``paperboat`` on PATH, so Simplicial must be installed
(``paperboat app install simplicial``). The first build of a station compiles it, which takes a minute or
so; a model with MultiBody shapes builds an FMU first, which takes longer.

A model with MultiBody shapes (bodies, joints) draws them on the station's 3D view in
Simplicial, as Articula's own 3D view does, and they move with the run. A model without shapes has no
3D scene.

In the station, the model's parameters (a ``parameter Real C1F``) are props of its Station object,
edited on the Station page; the Flow block carries only the inputs and outputs. See the
`Simplicial manual <https://paperboatlab.org/apps/simplicial/>`_ for running it.
