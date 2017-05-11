import { Observable } from 'rxjs';
import { Store } from 'redux';
import { IRule, Matcher, observize, Helpers } from '../Rules';
import { ITextMatch } from './Text';
import { IStateMatch } from './State';
import { IReduxMatch } from './Redux';
import { UniversalChat, Message, Activity, EventActivity, Typing, Address, getAddress, IChatActivityMatch, IChatMessageMatch, IChatEventMatch, IChatTypingMatch, IActivityMatch } from './Chat';

export interface IReduxActivityMatch<APP, BOTDATA> extends IReduxMatch<APP, BOTDATA>, IChatActivityMatch {
}

export interface IReduxMessageMatch<APP, BOTDATA> extends ITextMatch, IReduxMatch<APP, BOTDATA>, IChatMessageMatch {
}

export interface IReduxEventMatch<APP, BOTDATA> extends IReduxMatch<APP, BOTDATA>, IChatEventMatch {
}

export interface IReduxTypingMatch<APP, BOTDATA> extends IReduxMatch<APP, BOTDATA>, IChatTypingMatch {
}

export class ReduxChat<APP, BOTDATA> {
    public activity$: Observable<IActivityMatch>;

    constructor(
        private chat: UniversalChat,
        private store: Store<APP>,
        private getBotData: (state: APP) => BOTDATA
    ) {
    }

    // Matchers

    activities<M extends IActivityMatch>(): Matcher<M, M & IReduxActivityMatch<APP, BOTDATA>> {
        return (match) => {
            console.log("activities");
            const address = getAddress(match.activity);
            const state = this.store.getState();

            return {
                ... match as any, // remove "as any" when TypeScript fixes this bug

                // IChatActivityMatch
                address,
                reply: (activity: Activity | string) => this.chat.send(address, activity),
                replyAsync: (activity: Activity | string) => this.chat.sendAsync(address, activity),

                // IStateMatch
                data: this.getBotData(state),

                // IReduxMatch
                store: this.store,
                state,
                getBotData: this.getBotData,
            } as M & IReduxActivityMatch<APP, BOTDATA>;
        };
    }

    messages<M extends IReduxActivityMatch<APP, BOTDATA>>(): Matcher<M, M & IReduxMessageMatch<APP, BOTDATA>> {
        return (match) =>  {
            console.log("messages");
            return Observable.of(match.activity)
            .filter(activity => activity.type === 'message')
            .map((message: Message) => ({
                ... match as any, // remove "as any" when TypeScript fixes this bug

                // ITextMatch
                text: message.text,

                // IChatMessageMatch
                message
            } as M & IReduxMessageMatch<APP, BOTDATA>));
        }
    }

    events<M extends IReduxActivityMatch<APP, BOTDATA>>(): Matcher<M, M & IReduxEventMatch<APP, BOTDATA>> {
        return (match) => 
            Observable.of(match.activity)
            .filter(activity => activity.type === 'event')
            .map((event: EventActivity) => ({
                ... match as any, // remove "as any" when TypeScript fixes this bug

                // IChatEventMatch
                event
            } as M & IReduxEventMatch<APP, BOTDATA>));
    }

    typing<M extends IReduxActivityMatch<APP, BOTDATA>>(): Matcher<M, M & IReduxTypingMatch<APP, BOTDATA>> {
        return (match) => 
            Observable.of(match.activity)
            .filter(activity => activity.type === 'typing')
            .map((typing: Typing) => ({
                ... match as any, // remove "as any" when TypeScript fixes this bug

                // IChatTypingMatch
                typing
            } as M & IReduxTypingMatch<APP, BOTDATA>));
    }

    run<I extends IActivityMatch, A extends IReduxActivityMatch<APP, BOTDATA>, M extends IReduxMessageMatch<APP, BOTDATA>, E extends IReduxEventMatch<APP, BOTDATA>, T extends IReduxTypingMatch<APP, BOTDATA>>(rules: {
        messages?: IRule<M>,
        events?: IRule<E>,
        typing?: IRule<T>,
        other?: IRule<A>
    }) {
        const { first: firstActivity, prepend: prependActivity, run: runActivity } = new Helpers<IActivityMatch>();
        const { first, filter, run, prepend } = new Helpers<IReduxActivityMatch<APP, BOTDATA>>();

        const rule = firstActivity(
            runActivity(match => console.log("IActivityMatch", match)),
            prependActivity(this.activities(), first(
                run(match => console.log("IReduxActivityMatch", match)),
                run(match => console.log("state before", match.state)),
                rules.messages  && prepend(this.messages(),  rules.messages),
                rules.events    && prepend(this.events(),    rules.events),
                rules.typing    && prepend(this.typing(),    rules.typing),
                rules.other
            ))
        );

        this.chat.activity$
        .map(activity => ({ activity }))
        .do(match => console.log("activity", match.activity))
        .flatMap(
            match => rule.callHandlerIfMatch(match),
            1
        )
        .subscribe(
            match => console.log("handled", match),
            error => console.log("error", error),
            () => console.log("complete")
        );
    }
}
