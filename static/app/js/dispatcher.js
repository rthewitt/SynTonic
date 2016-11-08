/*
 * This allows me to pass an eventbus around to modules and objects
 * that do not necessarily adhere to the Backbone.js use case,
 * but which need to communicate with Models, Views, etc
 */
define(['underscore', 'backbone'], function(_, Backbone) {
    return _.clone(Backbone.Events);
});
