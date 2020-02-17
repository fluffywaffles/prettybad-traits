import {
  d,
  ᐅᶠ,
  ᐅwhen,
  id,
  and,
  get,
  has,
  not,
  bind,
  flip,
  fold,
  push,
  update,
  method_of,
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
  console.assert(
    !has(Commutes.symbol)(target),
    'Commutes: `target` is already `Commutes`!',
  )
  return ᐅwhen(and([ has(`state`), not(has(Commutes.symbol)) ]))(ᐅᶠ([
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
  const tracking_symbol = TracksPropagation.tracking_symbol
  return ᐅᶠ([
    define_property.mut(tracking_symbol)(d.configurable ({ v: [] })),
    flip(fold(TracksPropagation.track_key))(keys),
  ])
}

define_properties.mut({
  tracking_symbol : d.nothing ({ v: Symbol(`tracking`) }),
  add_to_tracking : d.nothing ({ v: _add_to_tracking }),
  track_key       : d.nothing ({ v: _track_key }),
})(TracksPropagation)
function _add_to_tracking ({ key, symbol }) {
  return target => {
    const tracked_symbol = TracksPropagation.tracking_symbol
    return update(tracked_symbol)(push({ key, symbol }))(target)
  }
}

/**
 * `TracksPropagation.track_key` hides the value of a key under a private
 * symbol, and replaces the key with a proxy getter that passes the
 * parent's dynamic context (`this`) into the child object for
 * propagation. Note that internal overrides are *mutative*, making them
 * more efficient if a propagation-proxy getter is called many times.
 */
function _track_key (key) {
  return target => {
    console.assert(
      has(key)(target),
      `TracksPropagation: key (${key}) does not exist in target!`,
    )
    const tracked_child = get(key)(target)
    const symbol = Symbol(`tracked_child[${key}]`)
    const proxy = create_propagate_proxy(Propagators.propagate_up)(symbol)
    return ᐅwhen(has(key))(ᐅᶠ([
      TracksPropagation.add_to_tracking({ key, symbol }),
      define_properties.mut({
        [symbol] : d.non_writable ({ v: tracked_child }),
        [key]    : d.enumerable   ({ g: proxy }),
      }),
    ]))(target)
  }
}

function create_propagate_proxy (Propagator) {
  return function propagate_proxy_child (symbol) {
    return function override_propagate_using_parent_context () {
      const overrider = Propagator({ context: this, symbol })
      return Propagates.override(overrider)(this[symbol])
    }
  }
}

const Propagators = {
  propagate_up: create_propagate_up,
}
function create_propagate_up ({ symbol, context }) {
  return function propagate_up (result) {
    return update(symbol)(_ => result)(context)
  }
}

// General purpose override utility
function override_internal (symbol) {
  return replacement => target => {
    console.assert(
      has(symbol)(target),
      `override_internal: ${symbol.toString()} does not exist!`,
    )
    const override_property = d.configurable({ v: replacement })
    const do_override = define_property.mut(symbol)(override_property)
    return ᐅwhen(has(symbol))(do_override)(target)
  }
}

import {
  map,
  types,
  get_in,
  reflex,
  update_path,
} from '@prettybad/util'

export function test (suite) {
  function Tree () {
    return TracksPropagation([`leaf`, `leaf2`])({
      leaf   : Propagates(Leaf({})),
      leaf2  : Propagates(Leaf({})),
      height : 100,
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

  const is_function = reflex.type(types.function)
  const silence_asserts = thunk => {
    const _assert = console.assert
    console.assert = _ => { return }
    const result = thunk()
    console.assert = _assert
    return result
  }

  return suite(`we all have pretty bad traits...`, [
    t => t.suite(`Commutes`, {
      'encapsulates `state` changes with `commute` function': t => {
        const v5 = { v: 5 }
        const state_object = { state: v5 }
        const v5_bad_commutes = silence_asserts(_ => Commutes(v5))
        return t.eq(v5_bad_commutes)(v5)
            && t.ok(has(`commute`)(Commutes({ state: v5 })))
            && t.ok(has(`state`)(Commutes({ state: v5 })))
            && t.ok(is_function(get(`commute`)(Commutes({ state: v5 }))))
            && t.eq(Commutes({ state: v5 }).commute(_ => 0).state)(0)
      },
    }),
    t => {
      const commuting = Commutes({ state: [] })
      const propagating = Propagates(Commutes({ state: [] }))
      const base = { state: [] }
      const bad_propagates = silence_asserts(_ => Propagates(base))

      return t.suite(`Propagates`, {
        'creates a `propagate` method on a "Commutes" object': t => {
          return t.eq(bad_propagates)(base)
              && t.ok(has(Propagates.symbol)(propagating))
              && t.ok(is_function(get(`propagate`)(propagating)))
              && t.eq(propagating[Propagates.symbol])(id)
        },
        'wraps `commute` so that it also calls `propagate`': t => {
          const smoke = { message: 'propagate called' }
          const emit_smoke = result => [ smoke, result.state ]
          const Smokes = Propagates.override(emit_smoke)
          const smoke_test = Smokes(propagating)
          return t.eq(smoke_test.commute(push(0)))([ smoke, [0] ])
        },
      })
    },
    t => t.suite(`TracksPropagation`, {
      'overrides a subobject propagate method': t => {
        const propagate = Propagates.symbol
        const propagating = Propagates(Commutes({ state: 5 }))
        const tracked = TracksPropagation([`count`])({
          count: Propagates(Commutes({ state: 5 })),
        })
        const incremented = tracked.count.commute(v => v + 1)
        const has_count_state = ᐅᶠ([ get(`count`), has(`state`) ])
        return t.eq(propagating.state)(tracked.count.state)
            && !t.eq(tracked.count[propagate])(propagating[propagate])
            && t.ok(has_count_state(incremented))
            && t.eq(tracked.count.commute(v => v + 1).count.state)(6)
      },
      'every tracked value is kept in an array': t => {
        const tree = Tree()
        const tracked = tree[TracksPropagation.tracking_symbol]
        return t.eq(map(get(`key`))(tracked))([
          'leaf',
          'leaf2',
        ])
      },
      'getters and private symbols are equal': t => {
        const tree = Tree()
        const tracked = tree[TracksPropagation.tracking_symbol]
        return t.eq(map(get_in(tree))(map(get(`symbol`))(tracked)))([
          tree.leaf,
          tree.leaf2,
        ])
      },
    }),
    t => t.suite(`Tree example`, {
      'trees have green leaves': t => {
        const tree = Tree()
        return t.eq(tree.height)(100)
            && t.eq(tree.leaf.state.color)('green')
      },
      'they can turn brown': t => {
        const turned = Tree().leaf.turn()
        return t.eq(turned.height)(100)
            && t.eq(turned.leaf.state.color)('brown')
      },
      'and they can turn back again': t => {
        const turned_twice
          = Tree().leaf.turn().leaf.turn()
        return t.eq(turned_twice.height)(100)
            && t.eq(turned_twice.leaf.state.color)('green')
      },
      'and there is no caching or lossy updating': t => {
        const lossless = Tree().leaf.turn().leaf2.turn()
        return t.eq(lossless.leaf.state.color)('brown')
            && t.eq(lossless.leaf2.state.color)('brown')
      },
    }),
  ])
}
