import {
  d,
  ᐅᶠ,
  ᐅwhen,
  id,
  has,
  map,
  Map,
  bind,
  flip,
  fold,
  push,
  swap,
  apply,
  define,
  remove,
  update,
  method1,
  drop_end,
  method_of,
  from_entries,
  of_properties,
  define_property,
  define_properties,
} from '@prettybad/util'

/**
 * An object "commutes" when its state is equivalently exchanged. Based on
 * @prettybad/util's update, `commute` is a method that takes a function
 * for updating an object's state, and returns a new object with its state
 * correspondingly updated.
 *
 * The `Commutes` modifier attaches the `commute` method to an object. It
 * asserts that the object has a "state" key, and sets up a private
 * (extensible) commute implementation, which it proxies to a public
 * (inextensible) `commute` method. If there is no "state" key, it prints
 * a warning and simply returns the target object unmodified.
 */
export function Commutes (target) {
  console.assert(
    has(`state`)(target),
    'The `target` object of `Commutes` must have a state key!',
  )
  return ᐅwhen(has(`state`))(ᐅᶠ([
    define_property.mut(Commutes.symbol)(Commutes.property),
    define_property.mut(`commute`)(d.nothing({ v: Commutes.proxy_fn })),
  ]))(target)
}

define_properties.mut({
  symbol   : d.nothing ({ v: Symbol(`commute`) }),
  property : d.nothing ({ v: d.configurable({ v: _commute  }) }),
  proxy_fn : d.nothing ({ v: _proxy_commute }),
  override : d.nothing ({ v: _override_commute }),
})(Commutes)
function _commute (updater) {
  return update(`state`)(updater)(this)
}
function _proxy_commute (updater) {
  return this[Commutes.symbol](updater)
}
function _override_commute (override) {
  return override_internal(Commutes.symbol)(override)
}

/**
 * An object "propagates" when its state is contained in some other
 * object. An object that "propagates" has a `propagate` method which is
 * called with the object's state as its input whenever propagation should
 * occur. The `propagate` method updates the parent object, returning a
 * new parent object where only the nested object that just "propagated"
 * is changed.
 *
 * The `Propagates` modifier attaches a trivial `propagate` method (which
 * is the identity function), and extends the `commute` method so that any
 * call to `commute` immediately calls `propagate` on the resulting
 * commuted state. In other words: on its own, `Propagates` does not
 * change the behavior of an object and does not actually perform
 * propagation. Until it is used with a parent object that
 * `TracksPropagation` of it, it has no perceivable effect.
 */
export function Propagates (target) {
  console.assert(
    has(Commutes.symbol)(target),
    'The `target` object of `Propagates` must also be `Commutes`!',
  )
  return ᐅwhen(has(Commutes.symbol))(ᐅᶠ([
    define_property.mut(Propagates.symbol)(d.configurable({ v: id })),
    Propagates.wrap_commute,
  ]))(target)
}

define_properties.mut({
  symbol          : d.nothing ({ v: Symbol(`propagate`) }),
  override        : d.nothing ({ v: _override_propagate }),
  wrap_commute    : d.nothing ({ v: _wrap_commute }),
  commute_wrapper : d.nothing ({ v: _commute_wrapper }),
})(Propagates)
function _commute_wrapper (commute) {
  return function propagating_commute (updater) {
    return ᐅᶠ([
      bind(this)(commute),
      method_of(this)(Propagates.symbol),
    ])(updater)
  }
}
function _wrap_commute (target) {
  const new_commute = Propagates.commute_wrapper(target[Commutes.symbol])
  return Commutes.override(new_commute)(target)
}
function _override_propagate (override) {
  return override_internal(Propagates.symbol)(override)
}

/**
 * The `TracksPropagation` modifier is the companion to `Propagates` that
 * makes it useful. Given a set of keys, `TracksPropagation` checks that
 * every key points to an object which `Propagates`, and overrides those
 * objects' `propagate` methods to return updated parent objects whenever
 * the propagating (nested) object is commuted.
 */
export function TracksPropagation (keys) {
  return flip(fold(TracksPropagation.track_key))(keys)
}

define_properties.mut({
  tracking_symbol : d.nothing ({ v: Symbol(`tracking`) }),
  track_key       : d.nothing ({ v: _track_key }),
})(TracksPropagation)
function _track_key (key) {
  return target => {
    console.assert(
      has(key)(target),
      `TracksPropagation: key (${key}) does not exist in target!`
    )
    const propagate = Propagators.propagate_up({ key, target })
    const override_propagate = Propagates.override(propagate)
    return ᐅwhen(has(key))(update(key)(override_propagate))(target)
  }
}

const Propagators = {
  propagate_up: propagate_up_create,
}
function propagate_up_create ({ key, target }) {
  return function propagate_up (result) {
    return update(key)(_ => result)(target)
  }
}

// General purpose override utility
function override_internal (symbol) {
  return replacement => target => {
    console.assert(
      has(symbol)(target),
      `override_internal: ${symbol.toString()} does not exist!`
    )
    const override_property = d.configurable({ v: replacement })
    const do_override = define_property.mut(symbol)(override_property)
    return ᐅwhen(has(symbol))(do_override)(target)
  }
}

export function test (suite) {
  function Tree () {
    return TracksPropagation([`leaf`])({
      leaf: Propagates(Leaf({})),
      height: 100,
    })
  }

  function Leaf ({ color='green' }) {
    return Commutes({
      // state
      state : { color },
      // methods
      turn () {
        return this.commute(update(`color`)(current => {
          return current === 'green' ? 'brown' : 'green'
        }))
      },
    })
  }

  const tree = Tree()

  return suite(`sanity checks`, {
    'trees have green leaves': t => {
      return t.eq(tree.height)(100)
          && t.eq(tree.leaf.state.color)('green')
    },
    'they can turn brown': t => {
      const turned = tree.leaf.turn()
      return t.eq(turned.height)(100)
          && t.eq(turned.leaf.state.color)('brown')
    },
    'and they can turn back again': t => {
      const turned_twice
        = tree.leaf.turn().leaf.turn()
      return t.eq(turned_twice.height)(100)
          && t.eq(turned_twice.leaf.state.color)('green')
    },
  })
}
