var gObserversCollection = null,
    gEventsCollection = null;

function meteorStart(collections) {
    Session.set('ganttReady', false);
    gObserversCollection = new DataCollection();
    gEventsCollection = new DataCollection();

    var collectionsCursors = {
        tasks: null,
        links: null
    };

    if(arguments.length == 2) {
        collectionsCursors = arguments[0];
        collections = arguments[1];
    }
    else {
        collectionsCursors["tasks"] = collections["tasks"].find({}, {sort:{
            start_date:1,
            end_date: 1,
            createdAt: 1
        }});
        collectionsCursors["links"] = collections["links"].find();
    }


    var collection = {
        data: collectionsCursors["tasks"].fetch().map(function (task) {return parseItemData(task)}),
        links: collectionsCursors["links"].fetch()
    };

    gantt.parse(collection);
    //gantt._init_dnd();
    //gantt._init_dnd_events();

    initCollectionHandler(this, collections["tasks"], collectionsCursors["tasks"], "task", collections["links"]);
    initCollectionHandler(this, collections["links"], collectionsCursors["links"], "link");

}

function meteorStop() {
    $("#gantt_here").remove();
    if(gObserversCollection) {
        gObserversCollection.each(function(observer) {
            console.log(observer);
            observer.stop();
            console.log(observer);
        });
        gObserversCollection.clean();
    }

    var self = this;
    if(gEventsCollection) {
        gEventsCollection.each(function(eventId) {
            console.log(self.detachEvent);
            self.detachEvent(eventId);
        });
        gEventsCollection.clean();
    }
    gantt.clearAll();

}

function initCollectionHandler(gantt, collection, collectionCursor, itemType, linksCollection) {
    var itemTypeSettings = getItemTypeSettings(gantt, itemType),
        eventsNames = itemTypeSettings.events_names;

    var collectionHandlerObj = new CollectionHandler(collection);
    gEventsCollection.add(gantt.attachEvent("onTaskLoading", function(task) {
        collectionHandlerObj.save(task);
        return true;
    }));

    gEventsCollection.add(gantt.attachEvent(eventsNames.added, function(itemId, item) {
        collectionHandlerObj.save(item);
        return true;
    }));

    gEventsCollection.add(gantt.attachEvent(eventsNames.removed, function(itemId, item) {
        collectionHandlerObj.remove(itemId, item);
    }));


    if (linksCollection) {
        gEventsCollection.add(gantt.attachEvent(eventsNames.updated, function(itemId, item) {
            collectionHandlerObj.save(item);
        }));

        gEventsCollection.add(gantt.attachEvent("onAfterTaskDrag", function (id, mode,  e) {
            console.log('done dragging');
            var links, task;
            console.log(gantt.getTask(id));

            links = linksCollection.find({$or:[{source:id},{target:id}]}).fetch();
            links.forEach(function (link) {
                if (!link.linkType || link.linkType === "hard"){
                    if (link.source === id && link.target) {
                        task = gantt.getTask(link.target);
                        console.log('over');
                        console.log(task);
                        gantt.roundTaskDates(task);
                        gantt.updateTask(link.target);
                    } else if (link.target === id && link.source) {
                        task = gantt.getTask(link.source);
                        console.log('over here');
                        console.log(task);
                        gantt.roundTaskDates(task);
                        gantt.updateTask(link.source);
                    }
                }

            });
        }));

        gEventsCollection.add(gantt.attachEvent("onTaskDrag", function (id, mode, copy, original, e) {
            var dependencies,
                links, obj,
                diff = new Date(original.start_date).getTime() - new Date(copy.start_date).getTime();
            if (mode === "move") {
                links = linksCollection.find({$or:[{source:copy._id},{target:copy._id}]}).fetch();
                links.forEach(function (link) {
                    if (link && link.linkType && link.linkType === "hard") {
                        if (link.source === copy._id && link.target) {
                            dependencies = gantt.getTask(link.target.toString());
                            if (dependencies && dependencies.start_date) {
                                dependencies.start_date = new Date(new Date(dependencies.start_date).getTime() - diff);
                                dependencies.end_date = new Date(new Date(dependencies.end_date).getTime() - diff);

                                gantt.updateTask(link.target);
                            }
                        } else if (link.target === copy._id && link.source){
                            dependencies = gantt.getTask(link.source.toString());
                            if (dependencies && dependencies.start_date) {
                                dependencies.start_date = new Date(new Date(dependencies.start_date).getTime() - diff);
                                dependencies.end_date = new Date(new Date(dependencies.end_date).getTime() - diff);

                                gantt.updateTask(link.source);
                            }
                        }
                    }
                });
            }
        }));
    } else {
        gEventsCollection.add(gantt.attachEvent("onLinkClick", function (id, e) {
            var link = gantt.getLink(id),
                linkId,
                linkType;

            console.log('kdlsjfklsdj', link);
            if (!link._id){
                linkId = collection.findOne({target:link.target, source:link.source})._id;
            } else {
                linkId = link._id;
            }

            if (!link.linkType || link.linkType === "hard"){
                console.log('here');
                linkType = "soft";
                link.linkType = linkType;
            } else {
                linkType = "hard";
                link.linkType = linkType;
            }
            var yo = collection.update({_id:linkId}, {$set:{
                linkType: linkType
            }});

            console.log(yo);

            gantt.updateLink(id, link);

        }));
    }

    var methods = itemTypeSettings.methods;
    gObserversCollection.add(collectionCursor.observe({

        //added: function(data) {
        //    var itemData = parseItemData(data);
        //    console.log('add');
        //    if(!methods.isExists(itemData._id))
        //        methods.add(itemData);
        //},

        changed: function(data) {
            var itemData = parseItemData(data);

            if(!methods.isExists(itemData._id))
                return false;

            console.log(itemData);

            var item = methods.get(itemData.id);
            for(var key in itemData)
                item[key] = itemData[key];

            console.log('yo');
            console.log(itemData);
            methods.update(itemData._id);
            return true;
        },

        removed: function(data) {
            console.log(data);
            if(methods.isExists(data._id)) {
                console.log('exists');
                methods.remove(data._id);
            }
        }

    })
    );

}

function getItemTypeSettings(gantt, itemType) {
    var methods = {
        isExists: function() {},
        get: function() {},
        add: function() {},
        update: function() {},
        remove: function() {}
    },
    eventsNames = {
        added: "",
        updated: "",
        removed: ""
    };

    function isExistsItem(itemId) {
        return (itemId != null);
    }

    switch(itemType) {
        case "task":
            methods.isExists = function(taskId) {return (isExistsItem(taskId) && gantt.isTaskExists(taskId))};
            methods.get = gantt.getTask;
            methods.add = gantt.addTask;
            methods.update = gantt.updateTask;
            methods.remove = gantt.deleteTask;
            eventsNames.added = "onAfterTaskAdd";
            eventsNames.updated = "onAfterTaskUpdate";
            eventsNames.removed = "onAfterTaskDelete";
            break;

        case "link":
            methods.isExists = function(linkId) {return (isExistsItem(linkId) && gantt.isLinkExists(linkId))};
            methods.get = gantt.getLink;
            methods.add = gantt.addLink;
            methods.update = gantt.updateLink;
            methods.remove = gantt.deleteLink;
            eventsNames.added = "onAfterLinkAdd";
            eventsNames.updated = "onAfterLinkUpdate";
            eventsNames.removed = "onAfterLinkDelete";
            break;
    }

    for(var method in methods)
        methods[method] = methods[method].bind(gantt);

    return {methods: methods, events_names: eventsNames};
}

function CollectionHandler(collection) {

    this.save = function(item) {
        item = parseItemData(item);
        item.projectId = Session.get('projectId');
        var savedItemData = this.findItem(item._id);


        if(savedItemData){
            if (item.hasOwnProperty("text")) {
                collection.update({_id: savedItemData._id}, {
                    $set: {
                        text: item.text,
                        start_date: item.start_date,
                        end_date: item.end_date,
                        duration: item.duration
                    }
                });
            } else {
                console.log(item);
                collection.update({_id: savedItemData._id}, {
                    $set: {
                        source: item.source,
                        target: item.target
                    }
                });
            }
        }
        else {
            if (item.source) {
                item.linkType = "hard";
            }
            collection.insert(item);
        }
    };

    this.remove = function(itemId, item) {
        // if it has text it is a task
        if (item && item.text) {
            //check for links
            var links = LinksCollection.find({$or: [{source:item._id}, {target:item._id}]}).fetch();
            console.log(links);
            for (var i = 0; i < links.length; i++) {
                this.removeLink(links[i]);
            }
            console.log(item);
            collection.remove({_id:item._id});
        } else if (item.source) {
            this.removeLink(item);
        }

    };

    this.removeLink = function (link) {
        var Item = LinksCollection.findOne({source:link.source, target:link.target});
        LinksCollection.remove({_id:Item._id});
    };

    this.findItem = function(itemId) {
        return collection.findOne({_id: itemId});
    };
}

function parseItemData(item) {
    var itemData = {};
    for(var itemProperty in item) {

        // can't imagine what this is
        if((itemProperty.charAt(0) == "$"))
            continue;

        if(itemProperty == "id") {
            itemData["id"] = itemData["_id"];
        } else {
            itemData[itemProperty] = item[itemProperty];
        }
    }

    return itemData;
}

function DataCollection() {
    var collectionData = {},
        currentUid = new Date().valueOf();

    function _uid() {
        return currentUid++;
    }

    this.add = function(data) {
        var dataId = _uid();
        collectionData;
        collectionData[dataId] = data;
        return dataId;
    };

    this.each = function(handler) {
        for(var key in collectionData) {
            handler.call(this, collectionData[key]);
        }
    };

    this.clean = function() {
        collectionData = {};
    };
}



function initGanttMeteor(gantt) {
    gantt.meteor = meteorStart;
    gantt.meteorStop = meteorStop;
}

if(window.Gantt) {
    Gantt.plugin(function(gantt) {
        initGanttMeteor(gantt);
    });
}
else
    initGanttMeteor(gantt);